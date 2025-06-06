// Vote.ts - Handles player voting and results
import MultiplayerManager, { PlayerState } from './Multiplayer';
import FirebaseManager from './FirebaseManager';

const { ccclass, property } = cc._decorator;

interface VoteData {
    voter: string;
    voterName: string;
    target: string;
    timestamp: object;
}

@ccclass
export default class VoteManager extends cc.Component {
    @property(cc.Prefab)
    playerVoteButtonPrefab: cc.Prefab = null;

    @property(cc.Node)
    voteButtonContainer: cc.Node = null;

    @property(cc.Label)
    timerLabel: cc.Label = null;

    @property(cc.Label)
    statusLabel: cc.Label = null;

    @property(cc.Node)
    voteButton: cc.Node = null;

    @property
    voteTime: number = 30; // Seconds for voting

    @property(cc.Boolean)
    testMode: boolean = true; // Set to true for testing without real players

    private multiplayerManager: MultiplayerManager = null;
    private firebaseManager: FirebaseManager = null;
    private gameId: string = "default_game";
    private playerId: string = "";
    private playerName: string = "";
    private remainingTime: number = 30;
    private hasVoted: boolean = false;
    private voteButtons: Map<string, cc.Node> = new Map();
    private voteResults: Map<string, number> = new Map();
    private voteTimerCallback: Function = null;
    private selectedPlayerId: string = null;
    private selectedPlayerName: string = null;
    private selectionBorder: cc.Node = null;

    onLoad() {
        this.setupManagers();
        
        // Clear any existing buttons
        this.voteButtonContainer.removeAllChildren();
        
        // Setup vote button click handler
        if (this.voteButton) {
            const button = this.voteButton.getComponent(cc.Button) || this.voteButton.addComponent(cc.Button);
            button.node.on('click', () => this.onVoteButtonClicked());
            button.interactable = false; // Disabled until player selection
        }
        
        if (this.testMode) {
            this.setupTestMode();
        } else {
            this.setupVotingUI();
            this.createVoteSession();
            this.listenForVotes();
        }
        
        // Always start timer and set initial status
        this.startTimer();
        this.statusLabel.string = "Vote for who you think is the imposter!";
    }

    private setupManagers() {
        // Skip manager check in test mode
        if (this.testMode) return;
        
        this.multiplayerManager = MultiplayerManager.getInstance();
        this.firebaseManager = FirebaseManager.getInstance();
        
        if (!this.multiplayerManager || !this.firebaseManager) {
            cc.error("[VoteManager] Required manager instances not found!");
            return;
        }

        this.playerId = cc.sys.localStorage.getItem('playerId') || "";
        this.playerName = cc.sys.localStorage.getItem('playerName') || "Player";
        
        if (!this.playerId) {
            cc.error("[VoteManager] Player ID not found!");
            return;
        }
    }

    private setupTestMode() {
        cc.log("[VoteManager] TEST MODE ACTIVE - Using test players");
        const testPlayers = [
            { id: 'test_1', name: 'You (Local)', character: 'mario' },
            { id: 'test_2', name: 'Red (Sus)', character: 'chick1' },
            { id: 'test_3', name: 'Green', character: 'chick2' },
            { id: 'test_4', name: 'Blue', character: 'chick3' }
        ];
        
        // Create buttons for all non-local test players
        testPlayers.forEach(player => {
            if (player.id !== 'test_1') { // Skip local player
                this.createTestPlayerButton(player);
            }
        });
    }
    
    private createTestPlayerButton(player: { id: string, name: string, character: string }) {
        const buttonNode = cc.instantiate(this.playerVoteButtonPrefab);
        this.voteButtonContainer.addChild(buttonNode);
        
        // Set name
        const nameLabel = buttonNode.getChildByName("NameLabel")?.getComponent(cc.Label);
        if (nameLabel) nameLabel.string = player.name;
        
        // Add Button component if missing
        let button = buttonNode.getComponent(cc.Button);
        if (!button) {
            button = buttonNode.addComponent(cc.Button);
            // Configure the button
            button.transition = cc.Button.Transition.COLOR;
            button.normalColor = cc.Color.WHITE;
            button.pressedColor = new cc.Color(180, 180, 180);
            button.hoverColor = new cc.Color(230, 230, 230);
        }
        
        button.interactable = true;
        
        // Add click event handler
        button.node.on('click', () => {
            cc.log(`[VoteManager] Button clicked for ${player.name}`);
            
            // Update selection
            this.selectPlayer(player.id, player.name, buttonNode);
        });
        
        this.voteButtons.set(player.id, buttonNode);
    }
    
    private selectPlayer(playerId: string, playerName: string, buttonNode: cc.Node) {
        // Reset all buttons to normal
        this.voteButtons.forEach(btn => {
            btn.color = cc.Color.WHITE;
        });
        
        // Set selected player
        this.selectedPlayerId = playerId;
        this.selectedPlayerName = playerName;
        
        // Add white rectangle around selected button
        this.drawSelectionBorder(buttonNode);
        
        // Enable the VOTE button
        if (this.voteButton) {
            const button = this.voteButton.getComponent(cc.Button);
            if (button) button.interactable = true;
        }
        
        // Update status message
        this.statusLabel.string = `Selected ${playerName}. Click VOTE to confirm.`;
    }
    
    private drawSelectionBorder(buttonNode: cc.Node) {
        // Remove existing border if any
        if (this.selectionBorder) {
            this.selectionBorder.removeFromParent();
            this.selectionBorder = null;
        }
        
        // Create new selection border
        this.selectionBorder = new cc.Node("SelectionBorder");
        const graphics = this.selectionBorder.addComponent(cc.Graphics);
        
        // Set border properties
        graphics.lineWidth = 4;
        graphics.strokeColor = cc.Color.WHITE;
        
        // Get button size
        const width = buttonNode.width + 10;
        const height = buttonNode.height + 10;
        
        // Draw rectangle
        graphics.rect(-width/2, -height/2, width, height);
        graphics.stroke();
        
        // Add border to button
        buttonNode.addChild(this.selectionBorder);
    }
    
    private onVoteButtonClicked() {
        if (!this.selectedPlayerId || this.hasVoted) return;
        
        this.hasVoted = true;
        this.statusLabel.string = "Vote submitted! Waiting for others...";
        
        // Disable all player buttons and the vote button
        this.voteButtons.forEach((btn, id) => {
            const btnComp = btn.getComponent(cc.Button);
            if (btnComp) btnComp.interactable = false;
        });
        
        if (this.voteButton) {
            const button = this.voteButton.getComponent(cc.Button);
            if (button) button.interactable = false;
        }
        
        // Change border color to yellow
        if (this.selectionBorder) {
            const graphics = this.selectionBorder.getComponent(cc.Graphics);
            if (graphics) {
                graphics.clear();
                graphics.lineWidth = 4;
                graphics.strokeColor = cc.Color.YELLOW;
                
                const selectedButton = this.voteButtons.get(this.selectedPlayerId);
                if (selectedButton) {
                    const width = selectedButton.width + 10;
                    const height = selectedButton.height + 10;
                    graphics.rect(-width/2, -height/2, width, height);
                    graphics.stroke();
                }
            }
        }
        
        // In test mode, show results after a delay
        if (this.testMode) {
            this.scheduleOnce(() => {
                const isImposter = this.selectedPlayerId === 'test_2';
                this.showResults(this.selectedPlayerId, this.selectedPlayerName, isImposter);
            }, 2);
        } else {
            // Submit vote to Firebase
            this.submitVote(this.selectedPlayerId);
        }
    }

    private startTimer() {
        this.remainingTime = this.voteTime;
        this.updateTimerDisplay();
        this.voteTimerCallback = () => this.updateTimer();
        this.schedule(this.voteTimerCallback, 1);
    }
    
    private setupVotingUI() {
        if (!this.voteButtonContainer || !this.playerVoteButtonPrefab) {
            cc.error("[VoteManager] Missing required prefabs or containers!");
            return;
        }
        
        const players = this.multiplayerManager.getOnlinePlayers();
        
        if (!players || players.length === 0) {
            this.statusLabel.string = "No players found!";
            return;
        }
        
        cc.log(`[VoteManager] Setting up vote UI for ${players.length} players`);
        
        players.forEach(player => {
            if (player.id !== this.playerId) {
                this.createPlayerVoteButton(player);
            }
        });
    }
    
    private createPlayerVoteButton(player: any) {
        const buttonNode = cc.instantiate(this.playerVoteButtonPrefab);
        this.voteButtonContainer.addChild(buttonNode);
        
        // Set player name on button
        const nameLabel = buttonNode.getChildByName("NameLabel")?.getComponent(cc.Label);
        if (nameLabel) {
            nameLabel.string = player.name || "Unknown";
        }
        
        // Add Button component if missing
        let button = buttonNode.getComponent(cc.Button);
        if (!button) {
            button = buttonNode.addComponent(cc.Button);
            button.transition = cc.Button.Transition.COLOR;
            button.normalColor = cc.Color.WHITE;
            button.pressedColor = new cc.Color(180, 180, 180);
        }
        
        // Add click event
        if (button) {
            button.node.on('click', () => {
                this.selectPlayer(player.id, player.name, buttonNode);
            });
        }
        
        // Store reference to button
        this.voteButtons.set(player.id, buttonNode);
    }
    
    private createVoteSession() {
        if (!this.firebaseManager) return;
        
        const voteSessionRef = this.firebaseManager.database.ref(`games/${this.gameId}/voting`);
        voteSessionRef.update({
            startTime: firebase.database.ServerValue.TIMESTAMP,
            endTime: null,
            completed: false
        }).catch(err => cc.error("[VoteManager] Error creating vote session:", err));
    }
    
    private submitVote(targetPlayerId: string) {
        if (this.hasVoted || !this.firebaseManager) return;
        
        const voteRef = this.firebaseManager.database.ref(`games/${this.gameId}/voting/votes/${this.playerId}`);
        voteRef.set({
            voter: this.playerId,
            voterName: this.playerName,
            target: targetPlayerId,
            timestamp: firebase.database.ServerValue.TIMESTAMP
        })
        .then(() => this.handleVoteSubmitted(targetPlayerId))
        .catch(err => cc.error("[VoteManager] Error submitting vote:", err));
    }
    
    private handleVoteSubmitted(targetPlayerId: string) {
        this.hasVoted = true;
        this.statusLabel.string = "Vote submitted! Waiting for others...";
        
        // Disable all buttons
        this.voteButtons.forEach(btn => {
            const btnComp = btn.getComponent(cc.Button);
            if (btnComp) btnComp.interactable = false;
        });
        
        if (this.voteButton) {
            const button = this.voteButton.getComponent(cc.Button);
            if (button) button.interactable = false;
        }
    }
    
    private listenForVotes() {
        if (!this.firebaseManager) return;
        
        const votesRef = this.firebaseManager.database.ref(`games/${this.gameId}/voting/votes`);
        votesRef.on('value', (snapshot) => {
            const votes = snapshot.val() || {};
            const totalVotes = Object.keys(votes).length;
            const totalPlayers = this.multiplayerManager.getOnlinePlayers().length;
            
            // If everyone has voted, end the voting session early
            if (totalVotes >= totalPlayers - 1) {
                this.tallyVotes(votes);
            }
        });
    }
    
    private updateTimer() {
        this.remainingTime -= 1;
        this.updateTimerDisplay();
        
        if (this.remainingTime <= 0) {
            this.unschedule(this.voteTimerCallback);
            
            if (!this.testMode && this.firebaseManager) {
                // Get the final votes
                this.firebaseManager.database.ref(`games/${this.gameId}/voting/votes`)
                    .once('value')
                    .then(snapshot => {
                        const votes = snapshot.val() || {};
                        this.tallyVotes(votes);
                    });
            } else if (this.testMode) {
                // In test mode, pick a random player if no vote was cast
                if (!this.hasVoted) {
                    const randomId = 'test_' + (2 + Math.floor(Math.random() * 3));
                    const randomName = randomId === 'test_2' ? 'Red (Sus)' : 
                                      randomId === 'test_3' ? 'Green' : 'Blue';
                    this.showResults(randomId, randomName, randomId === 'test_2');
                }
            }
        }
    }
    
    private updateTimerDisplay() {
        if (this.timerLabel) {
            const minutes = Math.floor(this.remainingTime / 60);
            const seconds = this.remainingTime % 60;
            this.timerLabel.string = `${minutes}:${seconds.toString().padStart(2, '0')}`;
        }
    }
    
    private tallyVotes(votes: {[key: string]: VoteData}) {
        // Clear previous results
        this.voteResults.clear();
        
        // Count votes for each player
        Object.values(votes).forEach((vote: VoteData) => {
            const targetId = vote.target;
            const currentCount = this.voteResults.get(targetId) || 0;
            this.voteResults.set(targetId, currentCount + 1);
        });
        
        // Find the player with the most votes
        let maxVotes = 0;
        let ejectedPlayerId: string = null;
        
        this.voteResults.forEach((voteCount, playerId) => {
            if (voteCount > maxVotes) {
                maxVotes = voteCount;
                ejectedPlayerId = playerId;
            }
        });
        
        if (ejectedPlayerId) {
            if (!this.testMode && this.firebaseManager) {
                this.completeVoting(ejectedPlayerId, maxVotes);
            } else if (this.testMode) {
                // In test mode, directly check if ejected player is imposter
                const isImposter = ejectedPlayerId === 'test_2';
                const playerName = ejectedPlayerId === 'test_2' ? 'Red (Sus)' :
                                  ejectedPlayerId === 'test_3' ? 'Green' : 'Blue';
                this.showResults(ejectedPlayerId, playerName, isImposter);
            }
        } else {
            cc.warn("[VoteManager] No votes were cast!");
            // Return to game if no one was ejected
            this.scheduleOnce(() => cc.director.loadScene("GameScene"), 3);
        }
    }
    
    private completeVoting(ejectedPlayerId: string, voteCount: number) {
        if (!this.firebaseManager) return;
        
        // Mark voting as complete in Firebase
        const voteSessionRef = this.firebaseManager.database.ref(`games/${this.gameId}/voting`);
        voteSessionRef.update({
            endTime: firebase.database.ServerValue.TIMESTAMP,
            completed: true,
            ejectedPlayerId: ejectedPlayerId,
            voteCount: voteCount
        })
        .then(() => this.checkIfEjectedPlayerIsImposter(ejectedPlayerId))
        .catch(err => {
            cc.error("[VoteManager] Error completing voting:", err);
            this.scheduleOnce(() => cc.director.loadScene("GameScene"), 3);
        });
    }
    
    private checkIfEjectedPlayerIsImposter(ejectedPlayerId: string) {
        if (!this.firebaseManager || !this.multiplayerManager) return;
        
        // Check if the ejected player was the imposter
        this.firebaseManager.database.ref(`games/${this.gameId}/imposter/id`)
            .once('value')
            .then(snapshot => {
                const imposterId = snapshot.val();
                const isImposterEjected = (imposterId === ejectedPlayerId);
                
                // Get player name
                const players = this.multiplayerManager.getOnlinePlayers();
                const ejectedPlayer = players.find(p => p.id === ejectedPlayerId) || { name: "Unknown" };
                
                // Show the results screen
                this.showResults(ejectedPlayerId, ejectedPlayer.name, isImposterEjected);
                
                // Update game state based on result
                if (isImposterEjected) {
                    this.firebaseManager.database.ref(`games/${this.gameId}`).update({
                        state: "ended",
                        winner: "crew",
                        endTime: firebase.database.ServerValue.TIMESTAMP
                    });
                } else {
                    // Return to game after showing results
                    this.scheduleOnce(() => {
                        cc.director.loadScene("GameScene");
                    }, 5); 
                }
            });
    }
    
    private showResults(ejectedPlayerId: string, playerName: string, wasImposter: boolean) {
        if (wasImposter) {
            this.statusLabel.string = `${playerName} was the Imposter!\nCrew wins!`;
        } else {
            this.statusLabel.string = `${playerName} was NOT the Imposter!\nContinuing game...`;
        }
        
        // Update border for ejected player
        const ejectedButton = this.voteButtons.get(ejectedPlayerId);
        if (ejectedButton && this.selectionBorder) {
            const graphics = this.selectionBorder.getComponent(cc.Graphics);
            if (graphics) {
                graphics.clear();
                graphics.lineWidth = 4;
                graphics.strokeColor = wasImposter ? cc.Color.RED : cc.Color.GRAY;
                
                const width = ejectedButton.width + 10;
                const height = ejectedButton.height + 10;
                graphics.rect(-width/2, -height/2, width, height);
                graphics.stroke();
            }
        }
    }

    onDestroy() {
        // Clean up Firebase listeners
        if (!this.testMode && this.firebaseManager) {
            this.firebaseManager.database.ref(`games/${this.gameId}/voting/votes`).off();
        }
        
        // Unschedule timer
        if (this.voteTimerCallback) {
            this.unschedule(this.voteTimerCallback);
        }
    }
}