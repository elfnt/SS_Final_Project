// LobbyManager.ts
import MultiplayerManager from './Multiplayer';
const { ccclass, property } = cc._decorator;

@ccclass
export default class LobbyManager extends cc.Component {
    @property(cc.Label)
    gameIdLabel: cc.Label = null;
    
    @property(cc.Button)
    startGameButton: cc.Button = null;
    
    @property(cc.Label)
    waitingLabel: cc.Label = null;
    
    @property([cc.Node])
    playerSlots: cc.Node[] = [];
    
    private multiplayerManager: MultiplayerManager = null;
    
    start() {
        this.multiplayerManager = MultiplayerManager.getInstance();
        
        
        // Listen for player changes
        this.multiplayerManager.node.on('players-updated', this.updatePlayerDisplay, this);
        
        // Button event
        this.startGameButton.node.on('click', this.onStartGameClicked, this);
    }
    
    updatePlayerDisplay(playerData: {count: number, players: any[]}) {
        // Update waiting text
        this.waitingLabel.string = `Waiting for players... (${playerData.count}/4)`;
        
        // Update player slots
        for (let i = 0; i < this.playerSlots.length; i++) {
            if (i < playerData.count) {
                this.playerSlots[i].active = true;
                // Set player name, avatar, etc.
                const nameLabel = this.playerSlots[i].getChildByName("Name").getComponent(cc.Label);
                if (nameLabel) nameLabel.string = playerData.players[i].name || "Player";
            } else {
                this.playerSlots[i].active = false;
            }
        }
    }
    
    onStartGameClicked() {
        cc.director.loadScene('GameScene');
    }
}