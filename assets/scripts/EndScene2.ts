const {ccclass, property} = cc._decorator;
import FirebaseManager from './FirebaseManager';

@ccclass
export default class EndScene2 extends cc.Component {
    @property(cc.Prefab)
    playerPrefab: cc.Prefab = null;
    
    @property(cc.Node)
    playersContainer: cc.Node = null;
    
    @property(cc.Button)
    continueButton: cc.Button = null;

    onLoad() {
        // Disable container layout to allow manual positioning
        const containerLayout = this.playersContainer?.getComponent(cc.Layout);
        if (containerLayout) containerLayout.enabled = false;
        
        // Get imposter data from Firebase or localStorage
        this.getImposterIdAndDisplayResults();
        
        // Setup continue button
        this.continueButton.node.on('click', () => {
            cc.director.loadScene("MainMenu");
        });
    }
    
    private async getImposterIdAndDisplayResults() {
        let imposterId = '';
        
        try {
            // First try to get from localStorage (might be saved from previous screens)
            const gameDataStr = cc.sys.localStorage.getItem('gameData');
            if (gameDataStr) {
                const gameData = JSON.parse(gameDataStr);
                imposterId = gameData.imposterId;
            } else {
                // If not in localStorage, try to get from Firebase
                const firebaseManager = FirebaseManager.getInstance();
                const gameId = cc.sys.localStorage.getItem('gameId') || 'default_game';
                const snapshot = await firebaseManager.database.ref(`games/${gameId}/imposter/id`).once('value');
                imposterId = snapshot.val();
            }
        } catch (e) {
            cc.error("Error getting imposter ID:", e);
            // Fallback to test data
            imposterId = 'test_3';
        }
        
        this.displayResults(imposterId);
    }
    
    private displayResults(imposterId: string) {
        const players = this.getPlayersDataFromCache();
        
        // Clear and prepare container
        this.playersContainer.removeAllChildren();
        
        // Create player avatars
        players.forEach((player, index) => {
            // Create player node
            const playerNode = cc.instantiate(this.playerPrefab);
            this.playersContainer.addChild(playerNode);
            
            // Position player with 100 unit spacing
            const xPos = (index - (players.length - 1) / 2) * 150;
            playerNode.setPosition(cc.v2(xPos, 0));
            
            // Disable layout components
            const layout = playerNode.getComponent(cc.Layout);
            if (layout) layout.enabled = false;
            
            // Set player name
            const nameLabel = playerNode.getChildByName("NameLabel")?.getComponent(cc.Label);
            if (nameLabel) {
                nameLabel.string = player.name;
                // Make text larger and bold for better visibility
                nameLabel.fontSize = 16;
                nameLabel.enableBold = true;
            }
            
            // Mark imposter
            if (player.id === imposterId) {
                const roleLabel = new cc.Node("RoleLabel");
                const roleLabelComp = roleLabel.addComponent(cc.Label);
                roleLabelComp.string = "IMPOSTER";
                roleLabelComp.fontSize = 20;
                roleLabelComp.enableBold = true;
                roleLabelComp.node.color = cc.Color.RED;
                playerNode.addChild(roleLabel);
                roleLabel.y = -60;
            }
        });
        
        // Update container
        this.playersContainer.parent.setContentSize(this.playersContainer.parent.getContentSize());
    }
    
    private getPlayersDataFromCache() {
        try {
            // Get saved player list
            const cachedPlayers = JSON.parse(cc.sys.localStorage.getItem('lastActivePlayers')) || [];
            
            // Get local player information
            const localPlayerId = cc.sys.localStorage.getItem('playerId');
            const localPlayerName = cc.sys.localStorage.getItem('playerName') || "You";
            
            // Check if local player is already included
            const localPlayerIncluded = cachedPlayers.some(p => p.id === localPlayerId);
            
            // Add local player if not already in the list
            if (localPlayerId && !localPlayerIncluded) {
                cachedPlayers.push({
                    id: localPlayerId,
                    name: localPlayerName
                });
            }
            
            return cachedPlayers.length > 0 ? cachedPlayers : this.getTestData();
        } catch(e) {
            return this.getTestData();
        }
    }

    private getTestData() {
        return [
            { id: 'test_1', name: 'You' },
            { id: 'test_2', name: 'Player 2' },
            { id: 'test_3', name: 'Player 3' },
            { id: 'test_4', name: 'Player 4' }
        ];
    }
}