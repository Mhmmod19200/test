const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path'); // لاستخدام path.join

const app = express();
// تعديل مسار الملفات الثابتة ليكون أكثر مرونة
// يفترض أن مجلد public يحتوي على index.html, styles.css, app.js
// وأن server.js موجود في مجلد آخر (مثل server) بجانب public
// app.use(express.static(path.join(__dirname, '../public')));
// أو إذا كان server.js في نفس المجلد الرئيسي وبداخله public:
app.use(express.static(path.join(__dirname, 'public')));


const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });

const rooms = {}; // لتخزين معلومات الغرف (مثل من هو X ومن هو O)

io.on('connection', socket => {
  console.log('🔌', socket.id, 'connected');

  socket.on('join', roomId => {
    const room = io.sockets.adapter.rooms.get(roomId);
    const count = room ? room.size : 0;

    // التحقق إذا كانت الغرفة ممتلئة (أكثر من لاعب واحد بالفعل)
    if (count >= 2) {
      socket.emit('roomFull', roomId);
      console.log(`🚫 ${socket.id} tried to join full room ${roomId}`);
      return; // منع الانضمام
    }

    // // يمكنك إضافة تحقق من وجود الغرفة إذا أردت نظام غرف محدد مسبقاً
    // // حالياً أي رمز يعتبر غرفة جديدة إذا لم تكن موجودة وممتلئة

    socket.join(roomId);
    console.log(`🚪 ${socket.id} joined ${roomId}`);

    // إدارة رموز اللاعبين وبدء اللعبة
    if (!rooms[roomId]) {
        rooms[roomId] = { players: {}, playerCount: 0 };
    }
    rooms[roomId].playerCount++;
    const playerSymbol = (rooms[roomId].playerCount === 1) ? 'X' : 'O';
    rooms[roomId].players[socket.id] = playerSymbol;

    // إرسال الرمز للاعب المنضم حديثاً
    socket.emit('playerSymbol', playerSymbol);
    console.log(` присвоен символ ${playerSymbol} игроку ${socket.id} в комнате ${roomId}`); // Log symbol assignment

    // إرسال عدد اللاعبين للجميع في الغرفة
    io.in(roomId).emit('playerCount', rooms[roomId].playerCount);

    // إذا اكتمل النصاب، ابدأ اللعبة
    if (rooms[roomId].playerCount === 2) {
      console.log(`▶️ Game starting in room ${roomId}`);
      // X يبدأ دائماً
      io.in(roomId).emit('gameStart', 'X');
    }
  });

  socket.on('move', ({ roomId, index, player }) => {
    // فقط أرسل الحركة للخصم
    socket.to(roomId).emit('move', { index, player });
    // console.log(`🔄 Move in ${roomId}: ${player} at ${index}`); // لإضافة تتبع للحركات
  });

  // تعديل اسم الحدث ليستقبل طلب العميل
  socket.on('resetRequest', roomId => {
    console.log(`🔄 Reset requested in room ${roomId} by ${socket.id}`);
    // إرسال الحدث بالاسم الذي يتوقعه العميل
    socket.to(roomId).emit('resetGame');
  });

  socket.on('chat', ({ roomId, player, text }) => {
    // فقط أرسل الرسالة للخصم
    socket.to(roomId).emit('chat', { player, text });
  });

  // إضافة معالج لحدث المغادرة الاختيارية
  socket.on('leave', roomId => {
      handleDisconnect(socket, roomId); // استخدام نفس منطق قطع الاتصال
  });

  socket.on('disconnecting', () => {
    // المرور على كل الغرف التي كان فيها اللاعب قبل قطع الاتصال
    socket.rooms.forEach(roomId => {
        if (roomId !== socket.id) { // تجاهل الغرفة الافتراضية الخاصة باللاعب
            handleDisconnect(socket, roomId);
        }
    });
  });

  socket.on('disconnect', () => {
    console.log('❌', socket.id, 'disconnected');
  });

  // وظيفة مساعدة لمعالجة قطع الاتصال أو المغادرة
  function handleDisconnect(socket, roomId) {
      console.log(`👋 ${socket.id} left room ${roomId}`);
      socket.leave(roomId); // إزالة اللاعب من الغرفة في Socket.IO

      if (rooms[roomId]) {
          // إزالة اللاعب من تتبعنا الخاص
          if (rooms[roomId].players[socket.id]) {
              delete rooms[roomId].players[socket.id];
              rooms[roomId].playerCount--;
          }

          // إعلام اللاعب المتبقي (إن وجد)
          if (rooms[roomId].playerCount > 0) {
              socket.to(roomId).emit('opponentLeft');
              // تحديث عدد اللاعبين لديه أيضاً
              socket.to(roomId).emit('playerCount', rooms[roomId].playerCount);
              console.log(`📢 Notified opponent in ${roomId} about disconnection.`);
          } else {
              // إذا كانت الغرفة فارغة الآن، احذفها من التتبع
              console.log(`🗑️ Room ${roomId} is now empty and removed.`);
              delete rooms[roomId];
          }
      }
  }

});

const PORT = process.env.PORT || 3000; // استخدام متغير البيئة للمنفذ أو 3000
server.listen(PORT, () => console.log(`✅ Server running on port ${PORT}`));