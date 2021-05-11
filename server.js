const WebSocket = require('ws');
const http = require('http');
const fs = require('fs');
const uuid = require('uuid');

var server = http.createServer(function(request, response) {
    if(request.url == "/"){
        response.writeHead(200, {'Content-Type': 'text/html'});
        response.end(fs.readFileSync('index.html'));
    }else if(request.url == "/atlas.png"){
        response.writeHead(200, {'Content-Type': 'image/png'});
        response.end(fs.readFileSync('atlas.png'));
    }else if(request.url == "/ps2p.ttf"){
        response.writeHead(200, {'Content-Type': 'font/ttf'});
        response.end(fs.readFileSync('ps2p.ttf'));
    }else if(request.url == "/cgpixel.ttf"){
        response.writeHead(200, {'Content-Type': 'font/ttf'});
        response.end(fs.readFileSync('cgpixel.ttf'));
    }
});

const wss = new WebSocket.Server({ server });

class Player {
    constructor(carril, data){
        this.name = data.name;
        this.carril = carril;
    }
}

class Carrera {
    constructor(){
        this.id = Math.random();
        this.ncarriles = 8;
        this.w2p = {};   // websocketid -> player
        this.wss = [];
        this.players = [];
        this.started = false;
        this.podium = [];
        this.disqualifieds = 0;
    }

    start(){
        if(this.players.length - this.disqualifieds <= 1) {
            this.started = true;
            this.enviarTodos({action: "finish", podium: this.podium});
        } else {
            let that = this;
            for (let i=0; i<3; i++) setTimeout(() => { that.enviarTodos({action: "countdown", value: 3-i}); }, 1000+1000*i);
            setTimeout(() => {
                that.started = true;
                that.enviarTodos({action: "countdown", value: 0});    
            }, 4000+Math.random()*1500);    
        }
    }

    addPlayer(ws, data) {
        let player = new Player(this.players.length, data);
        this.players.push(player);
        this.w2p[ws.id] = player;
        this.wss.push(ws);
        ws.enviar({action: 'join_ok', player: player, players: this.players});
        this.enviarTodos({action: "new_player", player: player});

        if(this.players.length == 1) {
            let waiti = 0;
            let that = this;
            this.wait = setInterval(function(){
               if(waiti === 6){
                   that.start();
                  clearInterval(that.wait);
               }
               that.enviarTodos({action: "wait", value:10 - waiti});
               waiti++;
            }, 1000);
        }
        if (this.players.length >= this.ncarriles) {
            clearInterval(this.wait);
            this.start();
        }
    }

    update(ws, data) {
        let player = this.w2p[ws.id];

        if(!this.started && data.x > 0 && !player.disqualified) {
            ws.enviar({action: "disqualify", carril: player.carril});
            player.disqualified = true;
            this.disqualifieds++;
            
        } else if (data.x >= 1000 && !player.finished && !player.disqualified){
            player.finished = true;
            this.podium.push(player);
            let finishTimeout = setTimeout(() => {
                this.enviarTodos({action: "finish", podium: this.podium});
            }, 5000);
            if (this.podium.length >= 3 || this.podium.length >= this.players.length - this.disqualifieds) {
                this.enviarTodos({action: "finish", podium: this.podium});
                clearTimeout(finishTimeout);
            }
        }
        this.enviarTodos({action: "update", carril: player.carril, data: data});
    }

    fall(ws, data) {
        this.enviarTodos({action: "fall", i: data.i, carril: data.carril});
    }

    enviarTodos(m){ for (let ws of this.wss){ ws.enviar(m); }}
}

class Carreras {
    constructor(){
        this.carreras = {};
        this.currentRace = new Carrera();
        this.asignedCarrera = {};
    }

    joinPlayer(ws, data) {
    
        if(this.currentRace.started) {
            this.carreras[this.currentRace.id] = this.currentRace;
            this.currentRace = new Carrera();
        } 
        this.currentRace.addPlayer(ws, data);
        this.asignedCarrera[ws.id] = this.currentRace;
    }

    update(ws, data) {
        this.asignedCarrera[ws.id].update(ws, data);
    }

    fall(ws, data) {
        this.asignedCarrera[ws.id].fall(ws, data);
    }
}

let carreras = new Carreras();

wss.on('connection', (ws) => {
    ws.enviar = (m) => ws.send(JSON.stringify(m)); ws.id = uuid.v4();

    ws.on('message', (m) => {
        m = JSON.parse(m);
        
        if(m.action === 'join') {
            carreras.joinPlayer(ws, m.data);
        } else if (m.action === 'update') {
            carreras.update(ws, m.data);
        } else if (m.action === 'fall') {
            carreras.fall(ws, m.data);
        }
    });
});

server.listen(8888);