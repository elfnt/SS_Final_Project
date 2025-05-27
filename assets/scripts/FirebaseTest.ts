// Learn TypeScript:
//  - https://docs.cocos.com/creator/manual/en/scripting/typescript.html
// Learn Attribute:
//  - https://docs.cocos.com/creator/manual/en/scripting/reference/attributes.html
// Learn life-cycle callbacks:
//  - https://docs.cocos.com/creator/manual/en/scripting/life-cycle-callbacks.html

import { FirebaseManager } from "./FirebaseManager";

const { ccclass, property } = cc._decorator;

@ccclass
export default class FirebaseTest extends cc.Component {
    @property(cc.Node)
    playerNode: cc.Node = null; // The node representing this player

    @property(cc.Node)
    otherPlayerNode: cc.Node = null; // The node representing the other player
    
    @property
    playerId: string = "player1"; // Unique ID for this player - making it public for easier testing
    
    @property
    otherPlayerId: string = "player2"; // ID of the other player - making it public for easier testing

onLoad() {
    // Get or generate a game code
    const urlParams = new URLSearchParams(window.location.search);
    const gameCode = urlParams.get("gameCode") || this.generateGameCode();
    
    // Determine which player this client will control
    this.playerId = urlParams.get("playerId") || "player1";
    this.otherPlayerId = this.playerId === "player1" ? "player2" : "player1";
    
    console.log(`Game code: ${gameCode}`);
    console.log(`Initialized as: ${this.playerId}, watching: ${this.otherPlayerId}`);

    // Check if nodes exist before accessing them
    if (this.playerNode && this.otherPlayerNode) {
        // Set up which player is local and which is remote
        const playerScript = this.playerNode.getComponent('Player');
        const otherPlayerScript = this.otherPlayerNode.getComponent('Player');
        
        if (playerScript) playerScript.isLocalPlayer = true;
        if (otherPlayerScript) otherPlayerScript.isLocalPlayer = false;
    } else {
        console.warn("Player nodes not properly assigned in the Inspector");
    }

    const firebaseManager = FirebaseManager.getInstance();

    // Use the game code as part of the Firebase path
    const playerPath = `games/${gameCode}/players/${this.playerId}`;
    const otherPlayerPath = `games/${gameCode}/players/${this.otherPlayerId}`;

    if (this.playerNode) {
        // Save initial player data
        const initialPlayerData = {
            position: { x: this.playerNode.x, y: this.playerNode.y }
        };
        firebaseManager.savePlayerData(playerPath, initialPlayerData);

        // Attach touch listener to playerNode for local control
        this.playerNode.on(cc.Node.EventType.TOUCH_MOVE, (event) => {
            const delta = event.getDelta();
            this.playerNode.x += delta.x;
            this.playerNode.y += delta.y;

            // Update the player's position in Firebase
            const updatedPlayerData = {
                position: { x: this.playerNode.x, y: this.playerNode.y }
            };
            firebaseManager.savePlayerData(playerPath, updatedPlayerData);
        });
    }

    if (this.otherPlayerNode) {
        // Listen for real-time updates of the other player's position
        firebaseManager.listenToPlayerData(otherPlayerPath, (data) => {
            if (data && data.position) {
                this.otherPlayerNode.setPosition(data.position.x, data.position.y);
            }
        });
    }
    
    // Display the game code for the second player to join
    this.displayGameCode(gameCode);
}

// Generate a random 6-character game code
private generateGameCode(): string {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // Omitting similar-looking characters
    let code = '';
    for (let i = 0; i < 6; i++) {
        code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return code;
}

// Display the game code in the UI (you'll need to implement this)
private displayGameCode(code: string) {
    // Example: Display in a UI label
    const codeLabel = this.node.getChildByName('CodeLabel');
    if (codeLabel) {
        const label = codeLabel.getComponent(cc.Label);
        if (label) {
            label.string = `Game Code: ${code}`;
        }
    }
    console.log(`Share this game code with your friend: ${code}`);
}
}