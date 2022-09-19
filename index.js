// #region Initializations

const express = require('express')();
const server = require('http').createServer(express);

const io = require('socket.io')(server, {
    pingTimeout: 60000,
    pingInterval: 30000,
});
const { Console } = require('console');
var shortID = require('shortid');
var Room = require('./Classes/Room.js');
const port = process.env.PORT || 5000;
var rooms = [];
rooms[0] = [];
rooms[1] = [];
lastRoom = [];

// #endregion

//-----------------------------------------------------------------------------------------------------------

// #region Setup events

io.on('connection', function (socket) {
    if (!socket.roomID) {
        console.log('Connection Made');
        socket, room = null;
        socket.on('JoinRoom', function (data) {
            NewRoom(socket, data);
            StartGameCheck(socket);
        });

        socket.on('RejoinRoom', function (data) {
            if (data['roomID'] in rooms[data["Mode"]]) {

                console.log("Rejoined Room -", data['roomID'], " player = ", data['playerNumber']);
                socket.roomID = data['roomID'];
                socket.timerEnded = false;
                socket.gameMode = data["Mode"];
                socket.playerNumber = data['playerNumber'];
                socket.rejoin = true;
                rooms[socket.gameMode][socket.roomID].players++;
                rooms[socket.gameMode][socket.roomID].rejoinedSockets.push(socket);
                IncreasePlayersStillPlaying(socket);

                var gameStartFlags =
                {
                    turn: false,
                    initialStart: false,
                    randomSeed: rooms[socket.gameMode][socket.roomID].randomSeed,
                    room: socket.roomID,
                    hasBot: rooms[socket.gameMode][socket.roomID].hasBot,
                    playerId: rooms[socket.gameMode][socket.roomID].playerId,
                    playerName: rooms[socket.gameMode][socket.roomID].playerName,
                    playerDp: rooms[socket.gameMode][socket.roomID].playerDp,
                };
                socket.emit("StartGame", gameStartFlags);

                RejoinSocketOnNoPlayersInGame(socket);

            }
            else {
                socket.emit("RoomNotFound");
            }
        });

        socket.on('PlayerStrikerPositionChanged', function (data) {
            if (socket.roomID) {
                var strikerPos =
                {
                    position: data
                }
                socket.broadcast.to(socket.roomID).emit('OpponentStrikerPositionChanged', strikerPos);
            }
        });
        socket.on('PlayerStrikerShoot', function (data) {
            if (socket.roomID) {
                io.in(socket.roomID).emit('StrikerShoot', data);
            }
        });

        socket.on('TimerStart', function (data) {
            // socket.timer = data
            // socket.timerStarted = true
        });

        socket.on('LeaveMatch', function () {
            if (socket.roomID != null) {
                console.log("Player ", socket.playerNumber, " in room ", socket.roomID, " left match");
                var playerLeftNumber = {
                    playerNumber: socket.playerNumber
                };
                DecreasePlayersStillPlaying(socket);
                if (!rooms[socket.gameMode][socket.roomID].matchEnded) {
                    socket.broadcast.to(socket.roomID).emit('PlayerLeftMatch', playerLeftNumber);
                }
            }

        });

        socket.on('PlayerSelectedPieceColour', function (data) {
            if (socket.roomID) {
                rooms[socket.gameMode][socket.roomID].playerTargetPieceColours.push(data);
                console.log("Player - ", socket, " selected colour -", data);
                if (rooms[socket.gameMode][socket.roomID].playerTargetPieceColours.length == 2 || rooms[socket.gameMode][socket.roomID].hasBot) {
                    var pieceColours;
                    if (rooms[socket.gameMode][socket.roomID].playerTargetPieceColours[0] == rooms[socket.gameMode][socket.roomID].playerTargetPieceColours[1]) {
                        rooms[socket.gameMode][socket.roomID].coloursFlipped = true;
                        pieceColours =
                        {
                            flipped: true
                        }
                        socket.emit("GeneratePieces", pieceColours);
                    }
                    else {
                        pieceColours =
                        {
                            flipped: false
                        }
                        socket.emit("GeneratePieces", pieceColours);
                    }
                    io.in(socket.roomID).emit("BlackAndWhiteModeStartGame", pieceColours);
                }
                else {
                    var pieceColours =
                    {
                        flipped: false
                    }
                    socket.emit("GeneratePieces", pieceColours);
                }
            }
        });

        socket.on('OnChat', function (data) {
            var jsondata = data;
            console.log('Chat msg ' + jsondata.message + ' recieved from ' + jsondata.playerColorId);
            socket.broadcast.to(socket.roomID).emit('OnChat', data);
        });

        socket.on('TurnEnd', function (data) {
            if (socket.roomID && !socket.rejoin) {
                if (rooms[socket.gameMode][socket.roomID] && !rooms[socket.gameMode][socket.roomID].endTurnQueue.includes(socket.playerNumber)) {
                    console.log("Adding player", socket.playerNumber, "in room ", socket.roomID, " to end turn queue");
                    rooms[socket.gameMode][socket.roomID].endTurnQueue.push(socket.playerNumber);
                    if (rooms[socket.gameMode][socket.roomID].pieceData != null) {
                        for (var i = 0; i < rooms[socket.gameMode][socket.roomID].rejoinedSockets.length; i++) {
                            if (rooms[socket.gameMode][socket.roomID].rejoinedSockets[i].rejoin) {
                                console.log("Resuming game for rejoined player - ", rooms[socket.gameMode][socket.roomID].rejoinedSockets[i].playerNumber, " in room - ", socket.roomID, " , turn = ", rooms[socket.gameMode][socket.roomID].turn);
                                rooms[socket.gameMode][socket.roomID].rejoinedSockets[i].rejoin = false;

                                rooms[socket.gameMode][socket.roomID].rejoinedSockets[i].join(socket.roomID);


                                rooms[socket.gameMode][socket.roomID].rejoinedSockets[i].emit("PieceInfo", rooms[socket.gameMode][socket.roomID].pieceData);

                                rooms[socket.gameMode][socket.roomID].humanPlayers++;
                                var whoseTurn =
                                {
                                    turn: data,
                                    setTurn: false
                                }
                                var seed =
                                {
                                    randomSeed: rooms[socket.gameMode][socket.roomID].randomSeed
                                };

                                io.in(socket.roomID).emit('SetSeed', seed);
                                var scores =
                                {
                                    player1Score: rooms[socket.gameMode][socket.roomID].scores[0],
                                    player2Score: rooms[socket.gameMode][socket.roomID].scores[1],
                                }
                                rooms[socket.gameMode][socket.roomID].rejoinedSockets[i].emit("SetScore", scores);
                                if (!rooms[socket.gameMode][socket.roomID].endTurnQueue.includes(rooms[socket.gameMode][socket.roomID].rejoinedSockets[i].playerNumber)) {
                                    console.log("Adding player", rooms[socket.gameMode][socket.roomID].rejoinedSockets[i].playerNumber, " to end turn queue");
                                    rooms[socket.gameMode][socket.roomID].endTurnQueue.push(rooms[socket.gameMode][socket.roomID].rejoinedSockets[i].playerNumber);
                                }
                                rooms[socket.gameMode][socket.roomID].rejoinedSockets[i].emit("ResumeGame", whoseTurn);

                            }
                        }
                        while (rooms[socket.gameMode][socket.roomID].rejoinedSockets.length > 0 && rooms[socket.gameMode][socket.roomID].rejoinedSockets[0].rejoin == false) {
                            rooms[socket.gameMode][socket.roomID].rejoinedSockets.splice(0, 1);
                        }
                    }
                }
                console.log("turn ended");
                CheckEndTurn(socket);
            }

        });

        socket.on('PieceInfo', function (data) {
            if (socket.roomID) {
                rooms[socket.gameMode][socket.roomID].pieceData = data;
                if (!rooms[socket.gameMode][socket.roomID].hasBot) {
                    socket.broadcast.to(socket.roomID).emit('PieceInfo', data);
                }
            }
        });

        socket.on('SetTurn', function () {
            if (socket.roomID) {
                console.log("Setting turn in room ", socket.roomID, " - ", socket.playerNumber)
                rooms[socket.gameMode][socket.roomID].turn = socket.playerNumber;
            }
        });

        socket.on('SetScoresNoBot', function (data) {
            if (socket.roomID) {
                rooms[socket.gameMode][socket.roomID].scores[socket.playerNumber] = data;
            }
        });

        socket.on('SetScoresBot', function (data) {
            if (socket.roomID) {
                rooms[socket.gameMode][socket.roomID].scores[socket.playerNumber] = data['playerScore'];
                rooms[socket.gameMode][socket.roomID].scores[1] = data['botScore'];
            }
        });

        socket.on('SetScoresNoBot', function (data) {
            if (socket.roomID) {
                rooms[socket.gameMode][socket.roomID].scores[socket.playerNumber] = data;
            }
        });

        socket.on('PlayerWon', function () {
            if (socket.roomID) {
                rooms[socket.gameMode][socket.roomID].playerThatWon = socket.playerNumber;
                rooms[socket.gameMode][socket.roomID].matchEnded = true;
            }
        });

        socket.on('PlayerDraw', function () {
            if (socket.roomID) {
                rooms[socket.gameMode][socket.roomID].playerThatWon = 2;
                rooms[socket.gameMode][socket.roomID].matchEnded = true;
            }
        });

        socket.on('PlayerLost', function () {
            if (socket.roomID) {
                if (socket.playerNumber == 0) {
                    rooms[socket.gameMode][socket.roomID].playerThatWon = 1;
                }
                else {
                    rooms[socket.gameMode][socket.roomID].playerThatWon = 0;
                }
                rooms[socket.gameMode][socket.roomID].matchEnded = true;
            }
        });

        socket.on('SendEmoji', function (data) {
            if (socket.roomID) {
                if (!rooms[socket.gameMode][socket.roomID].hasBot) {
                    socket.broadcast.to(socket.roomID).emit('ReceiveEmoji', data);
                }
            }
        });

        socket.on('TimerEnd', function () {
            if (socket.roomID) {
                console.log(socket.playerNumber, " Sent timer end");
                // if(socket.timerStarted)
                // {
                //     socket.timer = 0;
                //     socket.timerStarted = false;
                // }
                socket.broadcast.to(socket.roomID).emit('TimerEnded');
            }
        });

        socket.on('disconnect', function () {
            if (socket.roomID != null) {
                if (socket.timerStarted) {
                    socket.timer = 0;
                    socket.timerStarted = false;
                }

                rooms[socket.gameMode][socket.roomID].players--;

                console.log("Player Disconnected from room ", socket.roomID);
                if (!socket.rejoin && rooms[socket.gameMode][socket.roomID].gameStarted) {
                    rooms[socket.gameMode][socket.roomID].humanPlayers--;
                    if (rooms[socket.gameMode][socket.roomID].endTurnQueue.includes(socket.colour)) {
                        var endTurnIndex = rooms[socket.gameMode][socket.roomID].endTurnQueue.indexOf(socket.colour);
                        if (endTurnIndex > -1) {
                            rooms[socket.gameMode][socket.roomID].endTurnQueue.splice(endTurnIndex, 1);
                        }
                    }
                    if (rooms[socket.gameMode][socket.roomID].humanPlayers > 0) {
                        CheckEndTurn(socket);
                    }
                }
                else if (socket.rejoin && rooms[socket.gameMode][socket.roomID].gameStarted) {
                    if (rooms[socket.gameMode][socket.roomID].rejoinedSockets.includes(socket)) {
                        var index = rooms[socket.gameMode][socket.roomID].rejoinedSockets.indexOf(socket);
                        rooms[socket.gameMode][socket.roomID].rejoinedSockets.splice(index, 1);
                    }
                }


                var playerDisconnectNumber = {
                    playerNumber: socket.playerNumber
                };
                if (!rooms[socket.gameMode][socket.roomID].matchEnded && rooms[socket.gameMode][socket.roomID].gameStarted) {
                    socket.broadcast.to(socket.roomID).emit('PlayerDisconnected', playerDisconnectNumber);
                }

                if (!rooms[socket.gameMode][socket.roomID].gameStarted || rooms[socket.gameMode][socket.roomID].matchEnded) {
                    clearInterval(rooms[socket.gameMode][socket.roomID].roomMatchStartTimer);
                    console.log("Room deletion timer interrupted for room - ", rooms[socket.gameMode][socket.roomID].roomID);
                    rooms[socket.gameMode][socket.roomID].roomMatchStartTimer = null;
                    rooms[socket.gameMode][socket.roomID].startRoomMatchmakingTimer = false;
                    // delete room if no players are left or only if bots are left
                    console.log("Rooms in game mode ", socket.gameMode, " before disconnect ", Object.keys(rooms[socket.gameMode]).length)
                    if ((rooms[socket.gameMode][socket.roomID].players == 0)) {
                        if (lastRoom[socket.gameMode] == socket.roomID) {
                            lastRoom[socket.gameMode] = null;
                        }
                        console.log("Deleting room - ", socket.roomID);
                        delete rooms[socket.gameMode][socket.roomID];
                    }
                    console.log("Rooms in game mode ", socket.gameMode, " after disconnect ", Object.keys(rooms[socket.gameMode]).length)
                }
                else if (rooms[socket.gameMode][socket.roomID].gameStarted) {
                    DecreasePlayersStillPlaying(socket);
                }
            }
        });

    }

});

// #endregion

//-----------------------------------------------------------------------------------------------------------

// #region Utility functions

function StartGameCheck(socket) {
    if (rooms[socket.gameMode][socket.roomID].players == 2 || rooms[socket.gameMode][socket.roomID].hasBot) {
        rooms[socket.gameMode][socket.roomID].startRoomMatchmakingTimer = false;
        rooms[socket.gameMode][socket.roomID].playersStillPlaying = rooms[socket.gameMode][socket.roomID].humanPlayers;
        console.log("Starting game....");
        rooms[socket.gameMode][socket.roomID].gameStarted = true;
        for (var i = 0; i < 2; i++) {
            rooms[socket.gameMode][socket.roomID].canRejoin.push(false);
        }
        rooms[socket.gameMode][socket.roomID].randomSeed = Math.floor(Math.random() * 255)
        var turn = socket.playerNumber == 0;
        var gameFlags =
        {
            turn: turn,
            initialStart: true,
            randomSeed: rooms[socket.gameMode][socket.roomID].randomSeed,
            room: rooms[socket.gameMode][socket.roomID].roomID,
            hasBot: rooms[socket.gameMode][socket.roomID].hasBot,
            playerId: rooms[socket.gameMode][socket.roomID].playerId,
            playerName: rooms[socket.gameMode][socket.roomID].playerName,
            playerDp: rooms[socket.gameMode][socket.roomID].playerDp,
        };
        socket.emit('StartGame', gameFlags);
        if (!rooms[socket.gameMode][socket.roomID].hasBot) {
            gameFlags =
            {
                turn: !turn,
                initialStart: true,
                randomSeed: rooms[socket.gameMode][socket.roomID].randomSeed,
                room: rooms[socket.gameMode][socket.roomID].roomID,
                hasBot: rooms[socket.gameMode][socket.roomID].hasBot,
                playerId: rooms[socket.gameMode][socket.roomID].playerId,
                playerName: rooms[socket.gameMode][socket.roomID].playerName,
                playerDp: rooms[socket.gameMode][socket.roomID].playerDp,
            };
            socket.broadcast.to(socket.roomID).emit('StartGame', gameFlags);
        }
    }
}

function RoomDeleteTimer(time, room) {
    if (room.roomDeleteTimer == null) {
        room.timerTime = time
        room.roomDeleteTimer = function () {
            if (!this.room.startRoomDeleteTimer && !this.room.matchEnded) {
                clearInterval(this.room.roomDeleteTimer);
                console.log("Room deletion timer interrupted for room - ", this.room.roomID);
                this.room.roomDeleteTimer = null;
            }
            else {
                this.room.timerTime--;
                console.log("Deleting room ", this.room.roomID, " in ", this.room.timerTime, " seconds");
                if (this.room.timerTime == 0) {
                    clearInterval(this.room.roomDeleteTimer);
                    console.log("Room deletion timer completed, deleting room - ", this.room.roomID);
                    this.room.roomDeleteTimer = null;
                    if (lastRoom[this.room.mode] == this.room.roomID) {
                        lastRoom[this.room.mode] = null;
                    }
                    delete rooms[this.room.mode][this.room.roomID];
                }
            }
        }
        room.roomDeleteTimer = setInterval(room.roomDeleteTimer.bind({ "room": room }), 1000);
    }
}

function DecreasePlayersStillPlaying(socket) {
    console.log("Player still playing decremented");
    rooms[socket.gameMode][socket.roomID].playersStillPlaying--;
    console.log("Player still playing = ", rooms[socket.gameMode][socket.roomID].playersStillPlaying);
    if (rooms[socket.gameMode][socket.roomID].playersStillPlaying == 0) {
        if (rooms[socket.gameMode][socket.roomID].rejoinedSockets.length > 0) {
            for (var i = 0; i < rooms[socket.gameMode][socket.roomID].rejoinedSockets.length; i++) {
                if (rooms[socket.gameMode][socket.roomID].rejoinedSockets[i].rejoin) {
                    RejoinSocketOnNoPlayersInGame(socket);
                }
            }
        }
        else {
            console.log("Empty room, room deletion timer started.");
            rooms[socket.gameMode][socket.roomID].startRoomDeleteTimer = true;
            RoomDeleteTimer(10, rooms[socket.gameMode][socket.roomID]);
        }
    }
}



function IncreasePlayersStillPlaying(socket) {
    console.log("Player still playing incremented");
    rooms[socket.gameMode][socket.roomID].playersStillPlaying++;
    console.log("Player still playing = ", rooms[socket.gameMode][socket.roomID].playersStillPlaying);
    rooms[socket.gameMode][socket.roomID].startRoomDeleteTimer = false;
}

function RejoinSocketOnNoPlayersInGame(socket) {
    console.log("Checking socket rejoin in room ", socket.roomID, " and human players = ", rooms[socket.gameMode][socket.roomID].humanPlayers);
    if (rooms[socket.gameMode][socket.roomID].humanPlayers == 0) {

        socket.rejoin = false;
        socket.join(socket.roomID);


        console.log("Syncing piece data - ", rooms[socket.gameMode][socket.roomID].pieceData);
        socket.emit("PieceInfo", rooms[socket.gameMode][socket.roomID].pieceData);

        var whoseTurn =
        {
            turn: socket.playerNumber,
            setTurn: true
        };
        rooms[socket.gameMode][socket.roomID].humanPlayers++;
        // if (rooms[socket.gameMode][socket.roomID].humanPlayers == 1) {
        //     io.in(rooms[socket.gameMode][socket.roomID].roomID).emit('StartPieceDataSync');
        // }

        var scores =
        {
            player1Score: rooms[socket.gameMode][socket.roomID].scores[0],
            player2Score: rooms[socket.gameMode][socket.roomID].scores[1],
        }
        socket.emit("SetScore", scores);
        console.log("Resuming game for rejoined player ", socket.playerNumber, " in room ", socket.roomID, ". Current turn - ", whoseTurn['turn']);
        socket.emit("ResumeGame", whoseTurn);
        // var randomSeedVar = 
        // {
        //     randomSeed: GetRandomNumberBasedOnTime()
        // };
        // io.in(socket.roomID).emit('RandomSeedReset', randomSeedVar);
        var index = rooms[socket.gameMode][socket.roomID].rejoinedSockets.indexOf(socket);
        rooms[socket.gameMode][socket.roomID].rejoinedSockets.splice(index, 1);
        if (rooms[socket.gameMode][socket.roomID].rejoinedSockets.length == 0) {
            rooms[socket.gameMode][socket.roomID].startRejoinSocketCheckTimer = false;
        }
    }
}

function CheckEndTurn(socket) {
    console.log("Human players in room - ", socket.roomID, " = ", rooms[socket.gameMode][socket.roomID].humanPlayers)
    if (rooms[socket.gameMode][socket.roomID].humanPlayers <= rooms[socket.gameMode][socket.roomID].endTurnQueue.length) {
        console.log("All players in room - ", socket.roomID, " have sent end turn signals.")
        rooms[socket.gameMode][socket.roomID].endTurnQueue = [];
        io.in(socket.roomID).emit('TurnEnded');
    }
    else {
        console.log("Players in end turn queue for room - ", socket.roomID, " = ", rooms[socket.gameMode][socket.roomID].endTurnQueue)
    }
}

function MatchmakingTimer(time, room) {
    if (room.roomMatchStartTimer == null) {
        room.timerTime = time
        room.roomMatchStartTimer = function () {
            if (!this.room.startRoomMatchmakingTimer) {
                clearInterval(this.room.roomMatchStartTimer);
                console.log("Room match start timer interrupted for room - ", this.room.roomID);
                this.room.roomMatchStartTimer = null;
            }
            else {
                this.room.timerTime--;
                console.log("Starting match in room ", this.room.roomID, " in ", this.room.timerTime, " seconds");
                if (this.room.timerTime == 0) {
                    clearInterval(this.room.roomMatchStartTimer);
                    console.log("Room match start timer completed, room - ", this.room.roomID);
                    this.room.roomMatchStartTimer = null;


                    this.room.hasBot = true;
                    this.room.botType = 0;

                    StartGameCheck(this.room.initialSocket);
                }
            }
        }
        room.roomMatchStartTimer = setInterval(room.roomMatchStartTimer.bind({ "room": room }), 1000);
    }
}

function NewRoom(socket, data) {
    if (lastRoom[data["Mode"]] != null && rooms[data["Mode"]][lastRoom[data["Mode"]]].players < 2 && !rooms[data["Mode"]][lastRoom[data["Mode"]]].gameStarted) {
        console.log("Joining to old room");
        socket.roomID = rooms[data["Mode"]][lastRoom[data["Mode"]]].roomID;
        rooms[data["Mode"]][socket.roomID].humanPlayers++;
        rooms[data["Mode"]][lastRoom[data["Mode"]]].players++;

        if (rooms[data["Mode"]][lastRoom[data["Mode"]]].initialSocket == null) {
            rooms[data["Mode"]][lastRoom[data["Mode"]]].initialSocket = socket;
        }
        if (rooms[data["Mode"]][lastRoom[data["Mode"]]].players == 1) {
            rooms[data["Mode"]][socket.roomID].startRoomMatchmakingTimer = true;
            MatchmakingTimer(300, rooms[data["Mode"]][socket.roomID]);
        }
    }

    else {
        console.log("New room created");
        console.log("Mode = ", data["Mode"])
        var roomId = shortID.generate();
        lastRoom[data["Mode"]] = roomId;
        rooms[data["Mode"]][roomId] = new Room(roomId, 1, false, -1, data["Mode"])
        socket.roomID = roomId;
        rooms[data["Mode"]][socket.roomID].startRoomMatchmakingTimer = true;
        rooms[data["Mode"]][socket.roomID].humanPlayers++;

        rooms[data["Mode"]][lastRoom[data["Mode"]]].initialSocket = socket;
        MatchmakingTimer(300, rooms[data["Mode"]][socket.roomID]);
    }
    socket.rejoin = false;
    socket.timerEnded = false;
    socket.gameMode = data["Mode"];
    socket.playerNumber = rooms[socket.gameMode][socket.roomID].players - 1;
    console.log("Game mode = ", data["Mode"]);
    rooms[data["Mode"]][socket.roomID].playerId[socket.playerNumber] = data['playerId'];
    rooms[data["Mode"]][socket.roomID].playerName[socket.playerNumber] = data['playerName'];
    rooms[data["Mode"]][socket.roomID].playerDp[socket.playerNumber] = data['playerDp'];
    // joining socket in a room
    socket.join(socket.roomID)

}

// #endregion

//-----------------------------------------------------------------------------------------------------------

server.listen(port, () => console.log('Server Started'));

console.log(`running on :${port}`);

