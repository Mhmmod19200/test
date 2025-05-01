// إعداد عام
const socket = io(); // افترض أن الخادم يعمل على نفس النطاق
let board = Array(9).fill('');
let currentPlayer, mySymbol, gameMode, currentRoom;
let gameActive = false; // لتتبع حالة اللعبة نشطة أم لا

// تحميل النقاط من التخزين المحلي أو تهيئتها
let scores = JSON.parse(localStorage.getItem('ticTacToeScores')) || { X: 0, O: 0, D: 0 };

// عناصر الواجهة
const startScreen = document.getElementById('start-screen');
const onlineUI = document.getElementById('online-ui');
const gameContainer = document.getElementById('game-container'); // تم التحديث
const cells = document.querySelectorAll('.cell');
const statusEl = document.getElementById('status');
const resetBtn = document.getElementById('btn-reset');
const roomDisp = document.getElementById('room-display');
const waitMsg = document.getElementById('waiting-msg');
const chatContainer = document.getElementById('chat-container');
const chatBox = document.getElementById('chat-box');
const chatSound = document.getElementById('chat-sound');
const chatInput = document.getElementById('chat-input');
const chatSendBtn = document.getElementById('chat-send');
const scoreXEl = document.getElementById('score-x');
const scoreOEl = document.getElementById('score-o');
const scoreDEl = document.getElementById('score-d');
const backToMenuBtnGame = document.getElementById('btn-back-game'); // زر الرجوع من اللعبة
const backToMenuBtnOnline = document.getElementById('btn-back-online'); // زر الرجوع من واجهة الأونلاين

// تحديث عرض النقاط عند البدء
updateScoresDisplay();

// --- وظائف التنقل بين الشاشات ---
function showScreen(screenToShow) {
    startScreen.classList.add('hidden');
    onlineUI.classList.add('hidden');
    gameContainer.classList.add('hidden');

    if (screenToShow === 'start') {
        startScreen.classList.remove('hidden');
    } else if (screenToShow === 'online') {
        onlineUI.classList.remove('hidden');
    } else if (screenToShow === 'game') {
        gameContainer.classList.remove('hidden');
        // إظهار أو إخفاء الدردشة بناءً على وضع اللعبة
        chatContainer.style.display = (gameMode === 'online') ? 'block' : 'none';
    }
}

function resetUIState() {
    // إعادة تعيين أي حالة خاصة بالواجهة عند العودة للقائمة
    roomDisp.textContent = '';
    waitMsg.textContent = '';
    document.getElementById('room-input').value = '';
    if (currentRoom) {
        socket.emit('leave', currentRoom); // إعلام الخادم بالمغادرة إذا كان في غرفة
        currentRoom = null;
    }
    gameActive = false;
}

// --- معالجات أحداث أزرار البداية والرجوع ---
document.getElementById('btn-local').onclick = () => start('local');
document.getElementById('btn-ai').onclick = () => start('ai');
document.getElementById('btn-online').onclick = () => {
    gameMode = 'online';
    showScreen('online');
};

backToMenuBtnGame.onclick = () => {
    resetUIState();
    showScreen('start');
};
backToMenuBtnOnline.onclick = () => {
    resetUIState();
    showScreen('start');
};


// --- منطق الأونلاين ---
function generateRoomId() {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    return Array.from({ length: 6 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
}

document.getElementById('btn-create').onclick = () => {
    currentRoom = generateRoomId();
    socket.emit('join', currentRoom);
    roomDisp.textContent = 'رمز الغرفة: ' + currentRoom;
    waitMsg.textContent = 'بانتظار لاعب آخر...';
};

document.getElementById('btn-join').onclick = () => {
    const roomInput = document.getElementById('room-input');
    const room = roomInput.value.trim().toUpperCase();
    if (room.length === 6) {
        currentRoom = room;
        socket.emit('join', room);
        // سيتم تحديث الواجهة بناءً على رد الخادم (playerCount أو roomFull أو invalidRoom)
    } else {
        alert('رمز الغرفة يجب أن يتكون من 6 أحرف أو أرقام.');
        roomInput.focus();
    }
};

// استقبال أحداث من الخادم (Socket.IO)
socket.on('playerSymbol', (symbol) => {
    mySymbol = symbol; // الخادم يحدد الرمز لكل لاعب
    console.log(`تم تحديد رمزك: ${mySymbol}`);
});

socket.on('gameStart', (initialPlayer) => {
    // الخادم يخبر من يبدأ اللعب
    currentPlayer = initialPlayer;
    initGame(); // تهيئة اللعبة بعد تأكيد البدء من الخادم
});


socket.on('playerCount', (count) => {
    // تحديث رسالة الانتظار بناءً على رد الخادم
    if (count < 2) {
        waitMsg.textContent = 'بانتظار لاعب آخر...';
    } else {
        // لا تفعل شيئاً هنا، انتظر حدث gameStart
        waitMsg.textContent = 'تم العثور على لاعب!';
    }
});

socket.on('roomFull', (roomId) => {
    alert(`الغرفة ${roomId} ممتلئة.`);
    currentRoom = null; // إعادة تعيين الغرفة الحالية
    roomDisp.textContent = '';
    waitMsg.textContent = '';
});

socket.on('invalidRoom', (roomId) => {
    alert(`الغرفة ${roomId} غير موجودة أو غير صالحة.`);
    currentRoom = null;
    roomDisp.textContent = '';
    waitMsg.textContent = '';
});

socket.on('opponentLeft', () => {
    if (gameActive && gameMode === 'online') {
        alert('لقد غادر اللاعب الآخر!');
        statusEl.textContent = 'الخصم غادر. يمكنك العودة للقائمة.';
        gameActive = false; // إيقاف اللعبة
        // يمكنك إضافة خيار للعودة للقائمة أو انتظار لاعب جديد
    }
});


// --- بدء وتهيئة اللعبة ---
function start(mode) {
    gameMode = mode;
    if (mode !== 'online') {
        mySymbol = 'X'; // في المحلي والـ AI، اللاعب الأول دائمًا X
        currentPlayer = 'X'; // X يبدأ دائمًا
        initGame();
    }
    // في وضع الأونلاين، initGame ستُستدعى بواسطة حدث gameStart من الخادم
}

function initGame() {
    showScreen('game');
    board.fill('');
    cells.forEach(cell => {
        cell.textContent = '';
        cell.classList.remove('player-x', 'player-o', 'winner'); // إزالة الكلاسات
        // إعادة تفعيل الخلية إذا كانت معطلة
        cell.style.pointerEvents = 'auto';
    });
    gameActive = true;
    updateStatus();
}

// --- تحديث حالة اللعبة ---
function updateStatus() {
    if (!gameActive) return; // لا تحدّث إذا انتهت اللعبة

    let statusText = `الدور على: ${currentPlayer}`;
    if (gameMode === 'online') {
        statusText += ` (أنت: ${mySymbol})`;
        if (currentPlayer !== mySymbol) {
            statusText += ' - انتظر دورك';
        }
    } else if (gameMode === 'ai' && currentPlayer === 'O') {
         statusText += ' (دور الكمبيوتر)';
    }
    statusEl.textContent = statusText;
}

// --- التعامل مع نقرات الخلايا ---
cells.forEach((cell, index) => {
    cell.onclick = () => {
        // التحقق إذا كانت اللعبة نشطة، الخلية فارغة، والدور للاعب الحالي
        if (!gameActive || board[index] !== '') return;

        if (gameMode === 'online') {
            // في الأونلاين، تحقق إذا كان دور هذا اللاعب
            if (currentPlayer === mySymbol) {
                makeMove(index, mySymbol);
                // إرسال الحركة إلى الخادم
                socket.emit('move', { roomId: currentRoom, index: index, player: mySymbol });
            } else {
                // ليس دورك
                console.log("ليس دورك للعب.");
            }
        } else {
            // في المحلي أو ضد AI، التحقق من الدور كافٍ
            if (currentPlayer === mySymbol || gameMode === 'local') {
                 const playerToMove = currentPlayer; // اللاعب الذي قام بالحركة
                 makeMove(index, playerToMove);
                 // إذا كان الدور على AI، شغله بعد حركة اللاعب
                 if (gameMode === 'ai' && gameActive && currentPlayer === 'O') {
                     // تأخير بسيط لمحاكاة التفكير
                     setTimeout(aiMove, 500);
                 }
            }
        }
    };
});


// --- استقبال الحركات من الخادم ---
socket.on('move', ({ index, player }) => {
    // تأكد أن الحركة قادمة من اللاعب الآخر
    if (gameActive && player !== mySymbol && board[index] === '') {
        makeMove(index, player);
    }
});

// --- تنفيذ الحركة وتحديث اللوحة ---
function makeMove(index, player) {
    if (!gameActive || board[index] !== '') return; // تأكد مرة أخرى

    board[index] = player;
    cells[index].textContent = player;
    cells[index].classList.add(player === 'X' ? 'player-x' : 'player-o');
    // تعطيل الخلية بعد اللعب فيها
    cells[index].style.pointerEvents = 'none';

    if (checkWin(player)) {
        endGame(player);
    } else if (board.every(cell => cell !== '')) {
        endGame('D'); // D للتعادل (Draw)
    } else {
        // تبديل اللاعب وتحديث الحالة
        currentPlayer = (currentPlayer === 'X') ? 'O' : 'X';
        updateStatus();
    }
}

// --- التحقق من الفوز ---
function checkWin(player) {
    const winPatterns = [
        [0, 1, 2], [3, 4, 5], [6, 7, 8], // صفوف
        [0, 3, 6], [1, 4, 7], [2, 5, 8], // أعمدة
        [0, 4, 8], [2, 4, 6]  // أقطار
    ];

    for (const pattern of winPatterns) {
        const [a, b, c] = pattern;
        if (board[a] === player && board[b] === player && board[c] === player) {
            // إضافة كلاس للخلايا الفائزة (اختياري للتأثير البصري)
            // pattern.forEach(index => cells[index].classList.add('winner'));
            return true; // وجد نمط فوز
        }
    }
    return false; // لم يتم العثور على فوز
}

// --- إنهاء اللعبة ---
function endGame(winner) {
    gameActive = false; // إيقاف اللعبة

    // تعطيل جميع الخلايا
    // cells.forEach(cell => cell.style.pointerEvents = 'none');

    let message = '';
    if (winner === 'D') {
        message = 'انتهت اللعبة بالتعادل!';
        scores.D++;
    } else {
        message = `اللاعب ${winner} فاز!`;
        scores[winner]++;
    }
    statusEl.textContent = message; // عرض رسالة النهاية
    alert(message); // إظهار تنبيه أيضاً

    saveScores(); // حفظ النقاط المحدثة
    updateScoresDisplay(); // تحديث عرض النقاط

    // في وضع الأونلاين، اللاعب الأول (أو الخادم) قد يرسل طلب إعادة تعيين تلقائي أو ينتظر
    // حالياً، زر الإعادة اليدوي هو المسؤول
}


// --- إعادة الجولة ---
resetBtn.onclick = () => {
    if (gameMode === 'online') {
        // إرسال طلب إعادة تعيين إلى الخادم
        if (currentRoom) {
            socket.emit('resetRequest', currentRoom);
        }
    } else {
        // إعادة تعيين محلي أو ضد AI
        resetGameLocal();
    }
};

// استقبال طلب إعادة تعيين من الخادم
socket.on('resetGame', () => {
    resetGameLocal(); // تنفيذ إعادة التعيين محلياً
});

// وظيفة إعادة التعيين المحلية
function resetGameLocal() {
    board.fill('');
    cells.forEach(cell => {
        cell.textContent = '';
        cell.classList.remove('player-x', 'player-o', 'winner');
        cell.style.pointerEvents = 'auto'; // إعادة تفعيل الخلايا
    });
    currentPlayer = 'X'; // X يبدأ دائماً بعد الإعادة (يمكن تغييرها)
    gameActive = true;
    updateStatus();
    // إذا كان وضع AI، و X هو اللاعب البشري، لا تحتاج لعمل شيء
    // إذا كان وضع AI، و O هو اللاعب البشري (غير مدعوم حالياً)، ستحتاج لاستدعاء aiMove إذا بدأ O
}


// --- منطق الذكاء الاصطناعي (AI - Minimax) ---
function aiMove() {
    if (!gameActive) return; // تأكد أن اللعبة نشطة

    statusEl.textContent = 'الكمبيوتر يفكر...'; // رسالة مؤقتة

    // البحث عن أفضل حركة باستخدام Minimax
    const bestMove = minimax(board, 'O'); // AI يلعب بـ 'O'

    // تنفيذ الحركة بعد تأخير قصير
    setTimeout(() => {
        if (board[bestMove.index] === '') { // تأكد أن المكان لا يزال فارغاً
             makeMove(bestMove.index, 'O');
        } else {
             // إذا كان المكان مشغولاً (نادر جداً)، ابحث عن أي مكان فارغ
             const availableCells = board.map((val, idx) => val === '' ? idx : null).filter(val => val !== null);
             if(availableCells.length > 0) {
                 makeMove(availableCells[0], 'O');
             }
        }
    }, 300); // تأخير بسيط
}

function minimax(currentBoard, player) {
    // تحديد الخلايا المتاحة
    const availableCells = currentBoard.map((val, idx) => val === '' ? idx : null).filter(val => val !== null);

    // التحقق من حالات النهاية (الفوز، الخسارة، التعادل)
    if (checkWinBoard(currentBoard, 'X')) { // اللاعب البشري (X) فاز
        return { score: -10 };
    } else if (checkWinBoard(currentBoard, 'O')) { // الذكاء الاصطناعي (O) فاز
        return { score: 10 };
    } else if (availableCells.length === 0) { // تعادل
        return { score: 0 };
    }

    // تجميع الحركات الممكنة ونتائجها
    const moves = [];
    for (let i = 0; i < availableCells.length; i++) {
        const move = {};
        const index = availableCells[i];
        move.index = index; // تخزين الإندكس للحركة

        // قم بالحركة للاعب الحالي
        currentBoard[index] = player;

        // استدعاء minimax للخصم
        if (player === 'O') { // إذا كان الدور الحالي لـ AI (O)
            const result = minimax(currentBoard, 'X'); // احسب نتيجة حركة اللاعب (X)
            move.score = result.score;
        } else { // إذا كان الدور الحالي للاعب (X)
            const result = minimax(currentBoard, 'O'); // احسب نتيجة حركة AI (O)
            move.score = result.score;
        }

        // التراجع عن الحركة (Backtrack)
        currentBoard[index] = '';

        // إضافة الحركة ونتيجتها للمصفوفة
        moves.push(move);
    }

    // اختيار أفضل حركة
    let bestMove;
    if (player === 'O') { // دور AI (O) - يريد تعظيم النتيجة
        let bestScore = -Infinity;
        for (let i = 0; i < moves.length; i++) {
            if (moves[i].score > bestScore) {
                bestScore = moves[i].score;
                bestMove = i;
            }
        }
    } else { // دور اللاعب (X) - يريد تقليل النتيجة
        let bestScore = Infinity;
        for (let i = 0; i < moves.length; i++) {
            if (moves[i].score < bestScore) {
                bestScore = moves[i].score;
                bestMove = i;
            }
        }
    }

    // إرجاع أفضل حركة تم العثور عليها
    return moves[bestMove];
}

// نسخة من checkWin تعمل على أي لوحة (مفيدة لـ Minimax)
function checkWinBoard(boardToCheck, player) {
     const winPatterns = [
        [0, 1, 2], [3, 4, 5], [6, 7, 8], [0, 3, 6], [1, 4, 7], [2, 5, 8], [0, 4, 8], [2, 4, 6]
    ];
    for (const pattern of winPatterns) {
        if (pattern.every(index => boardToCheck[index] === player)) {
            return true;
        }
    }
    return false;
}


// --- منطق الدردشة (أونلاين فقط) ---
chatSendBtn.onclick = () => {
    const text = chatInput.value.trim();
    if (text && gameMode === 'online' && currentRoom) {
        const messageData = { roomId: currentRoom, player: mySymbol, text: text };
        socket.emit('chat', messageData); // إرسال الرسالة للخادم
        appendMsg(`أنت (${mySymbol})`, text); // عرض رسالتك فوراً
        chatInput.value = ''; // مسح حقل الإدخال
    }
};

// معالجة حدث الضغط على Enter في حقل الدردشة
chatInput.addEventListener('keypress', function (e) {
    if (e.key === 'Enter') {
        chatSendBtn.onclick(); // استدعاء نفس وظيفة زر الإرسال
    }
});


socket.on('chat', ({ player, text }) => {
    // استقبال رسالة من الخادم وعرضها
    if (player !== mySymbol) { // عرض رسائل اللاعب الآخر فقط لتجنب التكرار
        appendMsg(player, text);
        // تشغيل صوت الإشعار إذا لم تكن النافذة نشطة (اختياري)
        if (document.hidden) {
             chatSound.play().catch(e => console.log("لم يتم تشغيل الصوت:", e));
        }
    }
});

function appendMsg(sender, message) {
    const div = document.createElement('div');
    // استخدام innerHTML بحذر هنا، تأكد من أن sender و message آمنان
    // أو استخدم textContent إذا كنت لا تحتاج لتنسيق HTML داخل الرسالة
    div.innerHTML = `<strong>${sender}:</strong> ${message}`;
    chatBox.appendChild(div);
    // التمرير للأسفل تلقائياً لرؤية آخر رسالة
    chatBox.scrollTop = chatBox.scrollHeight;
}

// --- إدارة النقاط ---
function updateScoresDisplay() {
    scoreXEl.textContent = scores.X;
    scoreOEl.textContent = scores.O;
    scoreDEl.textContent = scores.D;
}

function saveScores() {
    localStorage.setItem('ticTacToeScores', JSON.stringify(scores));
}

// --- عند إغلاق الصفحة أو تحديثها ---
window.addEventListener('beforeunload', () => {
    // إعلام الخادم بمغادرة الغرفة إذا كان اللاعب في وضع الأونلاين
    if (gameMode === 'online' && currentRoom) {
        socket.emit('leave', currentRoom);
    }
});

// --- بدء الواجهة ---
showScreen('start'); // إظهار شاشة البداية عند تحميل الصفحة