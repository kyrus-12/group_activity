const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

// State Management
let gameState = {
    scores: { A: 0, B: 0 },
    currentSet: 'A',
    timeLeft: 30,
    isTimerRunning: false
};

let timerInterval = null;

app.use(express.static(path.join(__dirname, 'public')));

io.on('connection', (socket) => {
    console.log('A user connected:', socket.id);

    // Send current state to newly connected users
    socket.emit('init-state', gameState);

    // Admin: Change Question Set
    socket.on('change-set', (setName) => {
        gameState.currentSet = setName;
        io.emit('set-updated', setName);
    });

    // Admin: Start Global Timer
    socket.on('start-timer', () => {
        if (gameState.isTimerRunning) clearInterval(timerInterval);
        
        gameState.timeLeft = 30;
        gameState.isTimerRunning = true;
        
        io.emit('timer-tick', gameState.timeLeft);

        timerInterval = setInterval(() => {
            gameState.timeLeft--;
            io.emit('timer-tick', gameState.timeLeft);

            if (gameState.timeLeft <= 0) {
                clearInterval(timerInterval);
                gameState.isTimerRunning = false;
                io.emit('timer-end');
            }
        }, 1000);
    });

    // Scoring: Updates global scores
    socket.on('update-score', (data) => {
        // data = { group: 'A', points: 10 }
        gameState.scores[data.group] += data.points;
        io.emit('score-updated', gameState.scores);
    });

    socket.on('disconnect', () => {
        console.log('User disconnected');
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Aigham Server running on port ${PORT}`);
});
