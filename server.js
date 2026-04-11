const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

// --- GLOBAL STATE MANAGEMENT ---
let gameState = {
    scores: {}, 
    currentSet: 'A',
    timeLeft: 30,
    isTimerRunning: false,
    completedModules: {} 
};

// Initialize data for Groups 1-10
function resetGameState() {
    for (let i = 1; i <= 10; i++) {
        if (gameState.scores[i] === undefined) gameState.scores[i] = 0;
        // UPDATED: Changed keys to match your new HTML buttons
        gameState.completedModules[i] = { blue: null, pink: null, orange: null, yellow: null };
    }
}
resetGameState();

let timerInterval = null;

app.use(express.static(path.join(__dirname, 'public')));

io.on('connection', (socket) => {
    console.log('User Connected:', socket.id);

    socket.emit('init-state', gameState);

    // 2. ADMIN: CHANGE QUESTION SET
    socket.on('change-set', (setName) => {
        gameState.currentSet = setName;
        // UPDATED: Reset using the new color keys
        for (let i = 1; i <= 10; i++) {
            gameState.completedModules[i] = { blue: null, pink: null, orange: null, yellow: null };
        }
        
        console.log(`Question set changed to: ${setName}`);
        io.emit('set-updated', { 
            setName: gameState.currentSet, 
            completed: gameState.completedModules 
        });
    });

    // 3. ADMIN: SYNC COMMANDS (Music start/stop)
    socket.on('sync-admin-text', (txt) => {
        io.emit('sync-admin-text', txt);
    });

    // 4. GLOBAL TIMER LOGIC
    socket.on('start-timer', () => {
        if (timerInterval) clearInterval(timerInterval);
        
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

    // 5. MODULE SUBMISSION
    socket.on('submit-module', (data) => {
        let { group, color, isCorrect } = data;
        
        // The logic here is now correct because gameState.completedModules[group][color]
        // will look for 'blue', 'pink', etc.
        if (gameState.completedModules[group] && gameState.completedModules[group][color] === null) {
            gameState.completedModules[group][color] = isCorrect ? 'correct' : 'wrong';
            
            if (isCorrect) {
                gameState.scores[group] += 10;
            }
            
            io.emit('module-synced', { 
                group, 
                color, 
                status: gameState.completedModules[group][color],
                scores: gameState.scores 
            });
        }
    });

    socket.on('disconnect', () => {
        console.log('User Disconnected');
    });
});

const PORT = process.env.PORT || 10000;
server.listen(PORT, () => {
    console.log(`AIGHAM ENGINE LIVE ON PORT ${PORT}`);
});
