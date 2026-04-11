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
    // Tracks status: null (open), 'correct', or 'wrong'
    completedModules: {} 
};

// Initialize data for Groups 1-10
function resetGameState() {
    for (let i = 1; i <= 10; i++) {
        // Initialize scores to 0 if they don't exist
        if (gameState.scores[i] === undefined) gameState.scores[i] = 0;
        gameState.completedModules[i] = { red: null, green: null, yellow: null, orange: null };
    }
}
resetGameState();

let timerInterval = null;

// Serve static files from the 'public' directory
app.use(express.static(path.join(__dirname, 'public')));

io.on('connection', (socket) => {
    console.log('User Connected:', socket.id);

    // 1. SYNC NEW USERS (Sends current set, scores, and locked buttons)
    socket.emit('init-state', gameState);

    // 2. ADMIN: CHANGE QUESTION SET
    socket.on('change-set', (setName) => {
        gameState.currentSet = setName;
        // Reset only module buttons for the new set, but keep the cumulative scores
        for (let i = 1; i <= 10; i++) {
            gameState.completedModules[i] = { red: null, green: null, yellow: null, orange: null };
        }
        
        console.log(`Question set changed to: ${setName}`);
        io.emit('set-updated', { 
            setName: gameState.currentSet, 
            completed: gameState.completedModules 
        });
    });

    // 3. ADMIN: SYNC COMMANDS (Music start/stop and instructions)
    socket.on('sync-admin-text', (txt) => {
        // This broadcasts "START_MUSIC" or "STOP_MUSIC" to all clients
        io.emit('sync-admin-text', txt);
    });

    // 4. GLOBAL TIMER LOGIC
    socket.on('start-timer', () => {
        // Clear existing timer if any to prevent multiple intervals
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

    // 5. MODULE SUBMISSION (Anti-Cheat & Scoring)
    socket.on('submit-module', (data) => {
        let { group, color, isCorrect } = data;
        
        // Ensure the group exists and the module hasn't been submitted yet for this set
        if (gameState.completedModules[group] && gameState.completedModules[group][color] === null) {
            gameState.completedModules[group][color] = isCorrect ? 'correct' : 'wrong';
            
            if (isCorrect) {
                gameState.scores[group] += 10;
            }
            
            // Broadcast update to all clients (Admin scoreboard + Player UI locking)
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

// Port configuration for Render/Local
const PORT = process.env.PORT || 10000;
server.listen(PORT, () => {
    console.log(`AIGHAM ENGINE LIVE ON PORT ${PORT}`);
});
