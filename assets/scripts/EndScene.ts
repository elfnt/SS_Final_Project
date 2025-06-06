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
        // Retrieve vote data passed from the previous scene
        const voteDataStr = cc.sys.localStorage.getItem('voteData');
        if (!voteDataStr) {
            this.resultLabel.string = "Error: No data found!";
            // Fallback for testing
            this.displayResults({
                voteCounts: {},
                imposterId: 'none',
                crewWins: true
            });
            return;
        }
        
        const voteData = JSON.parse(voteDataStr);
        this.displayResults(voteData);
        
        this.continueButton.node.on('click', () => {
            // Clear the data so it's not reused
            cc.sys.localStorage.removeItem('voteData');
            cc.director.loadScene("Lobby"); // Or your main menu scene
        });
    }
    
    private displayResults(voteData: any) {
        const { voteCounts, imposterId, crewWins } = voteData;
        
        this.resultLabel.string = crewWins ? "PLAYERS WIN" : "IMPOSTER WINS";
        
        // Get player data, falling back to test data if needed
        const players = this.getPlayersDataFromCache();
        
        // Create an avatar for each player
        players.forEach((player, index) => {
            const playerNode = cc.instantiate(this.playerPrefab);
            this.playersContainer.addChild(playerNode);
            
            // Position players in a centered row
            const xPos = (index - (players.length - 1) / 2) * 150;
            playerNode.position = cc.v3(xPos, 0, 0);
            
            // Set player name
            const nameLabel = playerNode.getChildByName("NameLabel")?.getComponent(cc.Label);
            if (nameLabel) nameLabel.string = player.name;
            
            // Create vote count label
            const voteCountNode = new cc.Node("VoteCount");
            const voteCountLabel = voteCountNode.addComponent(cc.Label);
            voteCountLabel.fontSize = 30;
            voteCountLabel.string = `${voteCounts[player.id] || 0} votes`;
            playerNode.addChild(voteCountNode);
            voteCountNode.y = 80;
            
            // Highlight the imposter
            if (player.id === imposterId) {
                const roleLabel = new cc.Node("RoleLabel");
                const roleLabelComp = roleLabel.addComponent(cc.Label);
                roleLabelComp.string = "IMPOSTER";
                roleLabelComp.fontSize = 20;
                roleLabelComp.node.color = cc.Color.RED;
                playerNode.addChild(roleLabel);
                roleLabel.y = -60;
            }
        });
    }
    
    private getPlayersDataFromCache() {
        // In a real game, this data might be passed via a persistent node
        // or re-fetched. For now, we use a fallback.
        try {
            const playersData = JSON.parse(cc.sys.localStorage.getItem('lastActivePlayers'));
            return playersData || this.getTestData();
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