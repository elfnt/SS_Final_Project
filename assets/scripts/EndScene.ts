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

    private players: {id: string, name: string, isImposter: boolean}[] = [];
    private voteCounts: {[key: string]: number} = {};
    private crewWins: boolean = false;
    
    onLoad() {
        // Retrieve vote data from local storage
        const voteDataStr = cc.sys.localStorage.getItem('voteData');
        if (!voteDataStr) {
            this.resultLabel.string = "No vote data found!";
            return;
        }
        
        const voteData = JSON.parse(voteDataStr);
        this.displayResults(voteData);
        
        // Setup continue button
        this.continueButton.node.on('click', () => {
            cc.director.loadScene("MainMenu");
        });
    }
    
    private displayResults(voteData: any) {
        const { voteCounts, imposterId, crewWins } = voteData;
        this.voteCounts = voteCounts;
        this.crewWins = crewWins;
        
        // Update the result label
        this.resultLabel.string = crewWins ? 
            "Crew Wins! All players correctly identified the imposter!" : 
            "Imposter Wins! Not everyone voted correctly!";
        
        // Get players
        this.players = this.getPlayersData();
        this.players.forEach(p => p.isImposter = (p.id === imposterId));
        
        // Create player avatars with vote counts
        this.players.forEach((player, index) => {
            const playerNode = cc.instantiate(this.playerPrefab);
            this.playersContainer.addChild(playerNode);
            
            // Position players in a row
            playerNode.x = (index - Math.floor(this.players.length / 2)) * 200;
            
            // Set player name
            const nameLabel = playerNode.getChildByName("NameLabel")?.getComponent(cc.Label);
            if (nameLabel) nameLabel.string = player.name;
            
            // Create vote count label above head
            const voteCountNode = new cc.Node("VoteCount");
            const voteCountLabel = voteCountNode.addComponent(cc.Label);
            voteCountLabel.fontSize = 30;
            voteCountLabel.string = `${voteCounts[player.id] || 0} votes`;
            playerNode.addChild(voteCountNode);
            voteCountNode.y = 80; // Position above head
            
            // Highlight imposter
            if (player.isImposter) {
                const highlight = new cc.Node("ImposterHighlight");
                const graphics = highlight.addComponent(cc.Graphics);
                graphics.lineWidth = 4;
                graphics.strokeColor = cc.Color.RED;
                graphics.circle(0, 0, 60);
                graphics.stroke();
                playerNode.addChild(highlight);
                
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
    
    private getPlayersData() {
        try {
            // This would come from your MultiplayerManager in actual game
            const MultiplayerManager = require("./MultiplayerManager").default;
            return MultiplayerManager.getInstance().getOnlinePlayers();
        } catch (e) {
            // Fallback to test data if MultiplayerManager is not available
            return [
                { id: 'test_1', name: 'You (Local)' },
                { id: 'test_2', name: 'Red (Sus)' },
                { id: 'test_3', name: 'Green' },
                { id: 'test_4', name: 'Blue' }
            ];
        }
    }
}