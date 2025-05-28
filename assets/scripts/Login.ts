const { ccclass, property } = cc._decorator;

@ccclass
export default class Login extends cc.Component {
    @property(cc.EditBox)
    nameInput: cc.EditBox = null;
    
    @property(cc.Node)
    startButton: cc.Node = null;
    
    @property(cc.Node)
    errorLabel: cc.Node = null;

    onLoad() {
        // Set up button click event
        if (this.startButton) {
            this.startButton.on('click', this.onStartGame, this);
            console.log("Start button event listener added");
        } else {
            console.error("Start button reference is missing");
        }
        
        // Hide error message initially
        if (this.errorLabel) {
            this.errorLabel.active = false;
        }
    }
    
    onStartGame() {
        console.log("Start button clicked");
        
        const playerName = this.nameInput ? this.nameInput.string.trim() : "";
        if (!playerName) {
            this.showError("Please enter your name");
            return;
        }
        
        console.log(`Starting game with player name: ${playerName}`);
        
        // Store player info in localStorage (use trimmed value!)
        window.localStorage.setItem('playerName', playerName);
        
        // Generate a unique player ID
        const playerId = `player_${Date.now()}`;
        window.localStorage.setItem('playerId', playerId);
        
        // Go to game scene
        cc.director.loadScene('GameScene');
    }
    
    showError(message: string) {
        if (this.errorLabel) {
            this.errorLabel.active = true;
            const label = this.errorLabel.getComponent(cc.Label);
            if (label) {
                label.string = message;
            }
        } else {
            console.error(message);
        }
    }
}