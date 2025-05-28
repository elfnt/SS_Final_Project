import { FirebaseManager } from "./FirebaseManager";

const { ccclass, property } = cc._decorator;

@ccclass
export default class Login extends cc.Component {
    @property(cc.EditBox)
    nameInput: cc.EditBox = null;
    
    @property(cc.Node)
    startButton: cc.Node = null;
    
    @property(cc.Node)
    errorLabel: cc.Node = null;

    @property(cc.Node)
    loadingIndicator: cc.Node = null;

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
        
        // Hide loading indicator initially
        if (this.loadingIndicator) {
            this.loadingIndicator.active = false;
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
        
        // Generate a unique player ID
        const playerId = `player_${Date.now()}`;
        
        // Store player info in localStorage
        window.localStorage.setItem('playerName', playerName);
        window.localStorage.setItem('playerId', playerId);
        
        // Also store in window object for immediate access in the game scene
        window['playerName'] = playerName;
        window['playerId'] = playerId;
        
        // Show loading indicator
        if (this.loadingIndicator) {
            this.loadingIndicator.active = true;
        }
        
        // Disable the start button to prevent multiple clicks
        if (this.startButton) {
            this.startButton.getComponent(cc.Button).interactable = false;
        }
        
        // Save to Firebase before transitioning to game scene
        const firebaseManager = FirebaseManager.getInstance();
        firebaseManager.savePlayerData(playerId, { 
            name: playerName,
            createdAt: Date.now(),
            lastLogin: Date.now()
        })
        .then(() => {
            console.log("Player data saved to Firebase successfully");
            // Load game scene
            cc.director.loadScene('GameScene');
        })
        .catch(error => {
            console.error("Failed to save player data to Firebase:", error);
            // Still load the game scene even if Firebase save failed
            // This ensures the game is playable even without internet connection
            this.showError("Warning: Could not connect to server, playing in offline mode");
            setTimeout(() => {
                cc.director.loadScene('GameScene');
            }, 2000);
        });
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