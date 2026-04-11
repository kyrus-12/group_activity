const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

// --- GLOBAL STATE MANAGEMENT ---
// This keeps all 10 groups synced in real-time
let gameState = {
    scores: {}, 
    currentSet: 'A',
    timeLeft: 30,
    isTimerRunning: false
};

// Initialize scores for Groups 1 through 10
for (let i = 1; i <= 10; i++) {
    gameState.scores[i] = 0;
}

let timerInterval = null;

// Serve static files from the 'public' folder
app.use(express.static(path.join(__dirname, 'public')));

io.on('connection', (socket) => {
    console.log('User Connected:', socket.id);

    // 1. SYNC NEW USERS: Immediately send the current game status
    socket.emit('init-state', gameState);
    socket.emit('score-updated', gameState.scores);

    // 2. ADMIN: CHANGE QUESTION SET
    socket.on('change-set', (setName) => {
        gameState.currentSet = setName;
        console.log(`Question set changed to: ${setName}`);
        io.emit('set-updated', setName);
    });

    // 3. ADMIN: SYNC QUESTION TEXT
    // Shows the admin what question is currently being answered
    socket.on('sync-admin-text', (txt) => {
        io.emit('sync-admin-text', txt);
    });

    // 4. GLOBAL TIMER LOGIC
    socket.on('start-timer', () => {
        // Prevent multiple timers from overlapping
        if (gameState.isTimerRunning) {
            clearInterval(timerInterval);
        }
        
        gameState.timeLeft = 30;
        gameState.isTimerRunning = true;
        
        // Initial tick to update UI immediately
        io.emit('timer-tick', gameState.timeLeft);

        timerInterval = setInterval(() => {
            gameState.timeLeft--;
            io.emit('timer-tick', gameState.timeLeft);

            if (gameState.timeLeft <= 0) {
                clearInterval(timerInterval);
                gameState.isTimerRunning = false;
                console.log('Timer Ended');
                io.emit('timer-end');
            }
        }, 1000);
    });

    // 5. SCORING LOGIC
    socket.on('update-score', (data) => {
        // Expected data format: { group: "1", points: 10 }
        if (gameState.scores.hasOwnProperty(data.group)) {
            gameState.scores[data.group] += data.points;
            console.log(`Group ${data.group} score updated to: ${gameState.scores[data.group]}`);
            io.emit('score-updated', gameState.scores);
        }
    });

    socket.on('disconnect', () => {
        console.log('User Disconnected');
    });
});

// Use Render's default port 10000 or 3000 for local testing
const PORT = process.env.PORT || 10000;
server.listen(PORT, () => {
    console.log(`//////////////////////////////////////////`);
    console.log(`AIGHAM ENGINE LIVE ON PORT ${PORT}`);
    console.log(`//////////////////////////////////////////`);
});
