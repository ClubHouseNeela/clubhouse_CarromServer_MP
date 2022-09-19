module.exports = class Room {
	constructor(roomID, players, hasBot, botType, mode) {
		this.roomID = roomID;
		this.mode = mode;
		this.turn = 0
		this.scores = [0,0];
		this.playerId = [0,0];
		this.playerName = ["",""];
		this.playerDp = ["",""];
		this.players = players;
		this.gameStarted = false;
		this.playerTargetPieceColours = []
		this.endTurnQueue = []
		this.pieceData = null;
		this.matchEnded = false;
		this.hasBot = hasBot;
		this.randomSeed = -1;
		this.rejoinedSockets = []
		this.canRejoin = [];
		this.playerThatWon = -1
		this.roomDeleteTimer = null;
		this.startRoomDeleteTimer = false;
		this.startRoomMatchmakingTimer = false;
		this.roomMatchStartTimer = null;
		this.timerTime = -1;
		this.playersStillPlaying = 0;
		this.humanPlayers = 0;
		this.initialSocket = null;
		// botType = -1 for not bot
		//            0 for fairplay bot
		//		      1 for mustwin bot
		this.botType = botType;
		
        // Other values depending on game variation
	}
}