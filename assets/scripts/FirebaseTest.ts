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
    // Dynamically assign player IDs based on a query parameter or device
    const urlParams = new URLSearchParams(window.location.search);
    this.playerId = urlParams.get("playerId") || "player1";
    this.otherPlayerId = this.playerId === "player1" ? "player2" : "player1";
    
    console.log(`Initialized as: ${this.playerId}, watching: ${this.otherPlayerId}`);

    const firebaseManager = FirebaseManager.getInstance();

    // Set different starting positions based on player ID
    if (this.playerId === "player1") {
        this.playerNode.setPosition(-200, 0);  // Player 1 starts on the left
    } else {
        this.playerNode.setPosition(200, 0);   // Player 2 starts on the right
    }

    // Save initial player data based on the set positions
    const initialPlayerData = {
        position: { x: this.playerNode.x, y: this.playerNode.y },
    };
    firebaseManager.savePlayerData(this.playerId, initialPlayerData);

    // First, fetch the current position of the other player
    firebaseManager.fetchPlayerData(this.otherPlayerId)
        .then((data) => {
            if (data && data.position) {
                console.log(`Initial position of ${this.otherPlayerId}: `, data.position);
                this.otherPlayerNode.setPosition(data.position.x, data.position.y);
            }
        })
        .catch((error) => {
            console.error(`Error fetching ${this.otherPlayerId} data:`, error);
        });

    // Then, listen for real-time updates of the other player's position
    firebaseManager.listenToPlayerData(this.otherPlayerId, (data) => {
        if (data && data.position) {
            this.otherPlayerNode.setPosition(data.position.x, data.position.y);
        }
    });

    // Update this player's position in Firebase as they move
    if (this.playerId === "player1" || this.playerId === "player2") {
        this.node.on(cc.Node.EventType.TOUCH_MOVE, (event) => {
            const delta = event.getDelta();
            this.playerNode.x += delta.x;
            this.playerNode.y += delta.y;

            // Update the player's position in Firebase
            const updatedPlayerData = {
                position: { x: this.playerNode.x, y: this.playerNode.y },
            };
            firebaseManager.savePlayerData(this.playerId, updatedPlayerData);
        });
    }
}
}