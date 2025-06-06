const {ccclass, property} = cc._decorator;

@ccclass
export default class EndScene extends cc.Component {
    @property(cc.Prefab)
    playerPrefab: cc.Prefab = null;
    
    @property(cc.Node)
    playersContainer: cc.Node = null;
    
    @property(cc.Label)
    resultLabel: cc.Label = null;
    
    @property(cc.Button)
    continueButton: cc.Button = null;

    onLoad() {
        // Disable container layout to allow manual positioning
        const containerLayout = this.playersContainer?.getComponent(cc.Layout);
        if (containerLayout) containerLayout.enabled = false;
        
        // Get vote data or use test data
        let voteData;
        try {
            const voteDataStr = cc.sys.localStorage.getItem('voteData');
            voteData = voteDataStr ? JSON.parse(voteDataStr) : {
                voteCounts: {},
                imposterId: 'test_3',
                crewWins: true
            };
        } catch(e) {
            voteData = {
                voteCounts: {},
                imposterId: 'test_3',
                crewWins: true
            };
        }
        
        this.displayResults(voteData);
        
        // Setup continue button
        this.continueButton.node.on('click', () => {
            cc.sys.localStorage.removeItem('voteData');
            cc.director.loadScene("Lobby");
        });
    }
    
    private displayResults(voteData: any) {
        const { voteCounts = {}, imposterId, crewWins } = voteData;
        
        this.resultLabel.string = crewWins ? "PLAYERS WIN" : "IMPOSTER WINS";
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
            if (nameLabel) nameLabel.string = player.name;
            
            // Add vote count
            const voteCountNode = new cc.Node("VoteCount");
            const voteCountLabel = voteCountNode.addComponent(cc.Label);
            voteCountLabel.fontSize = 10;
            voteCountLabel.string = `${voteCounts[player.id] || 0} votes`;
            playerNode.addChild(voteCountNode);
            voteCountNode.y = -5;
            
            // Mark imposter
            if (player.id === imposterId) {
                const roleLabel = new cc.Node("RoleLabel");
                const roleLabelComp = roleLabel.addComponent(cc.Label);
                roleLabelComp.string = "IMPOSTER";
                roleLabelComp.fontSize = 10;
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
            return JSON.parse(cc.sys.localStorage.getItem('lastActivePlayers')) || this.getTestData();
        } catch(e) {
            return this.getTestData();
        }
    }

    private getTestData() {
        return [
            { id: 'test_1', name: 'Player 1' },
            { id: 'test_2', name: 'Player 2' },
            { id: 'test_3', name: 'Player 3' },
            { id: 'test_4', name: 'Player 4' }
        ];
    }
}