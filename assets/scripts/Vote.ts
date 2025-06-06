import MultiplayerManager, { PlayerState } from './Multiplayer';
import FirebaseManager from './FirebaseManager';

const { ccclass, property } = cc._decorator;

@ccclass
export default class VoteManager extends cc.Component {
    // Properties
    @property(cc.Prefab) playerVoteButtonPrefab: cc.Prefab = null;
    @property(cc.Node) voteButtonContainer: cc.Node = null;
    @property(cc.Label) timerLabel: cc.Label = null;
    @property(cc.Label) statusLabel: cc.Label = null;
    @property(cc.Node) confirmVoteButton: cc.Node = null;
    @property voteTime: number = 30;
    @property testMode: boolean = false;

    // Private fields
    private multiplayerManager: MultiplayerManager = null;
    private firebaseManager: FirebaseManager = null;
    private gameId = "default_game";
    private localPlayer = { id: "", name: "" };
    private hasVoted = false;
    private voteButtons = new Map<string, cc.Node>();
    private selectedPlayer: { id: string, name: string } = null;
    private selectionBorder: cc.Node = null;
    private remainingTime: number = 0;
    private voteSessionEnded = false;  // Flag to prevent double scene loading

    onLoad() {
        // Setup
        this.setupManagers();
        this.initializeUI();
        this.startVotingSession();
    }

    private setupManagers() {
        if (this.testMode) return;
        
        this.multiplayerManager = MultiplayerManager.getInstance();
        this.firebaseManager = FirebaseManager.getInstance();
        this.localPlayer.id = cc.sys.localStorage.getItem('playerId') || "";
        this.localPlayer.name = cc.sys.localStorage.getItem('playerName') || "Player";
    }

    private initializeUI() {
        // Clear and setup UI elements
        this.voteButtonContainer.removeAllChildren();
        this.confirmVoteButton.getComponent(cc.Button).interactable = false;
        this.confirmVoteButton.on('click', this.onConfirmVoteClicked, this);
        
        // Create selection border for highlighting
        this.selectionBorder = new cc.Node("SelectionBorder");
        const graphics = this.selectionBorder.addComponent(cc.Graphics);
        graphics.lineWidth = 5;
        graphics.strokeColor = cc.Color.WHITE;
        this.selectionBorder.active = false;

        // Create player buttons
        this.getPlayersForVoting().forEach(p => this.createPlayerButton(p));
        this.statusLabel.string = "Vote for the imposter!";
    }

    private getPlayersForVoting() {
        if (this.testMode) {
            return [
                { id: 'test_2', name: 'Red (Sus)' },
                { id: 'test_3', name: 'Green' },
                { id: 'test_4', name: 'Blue' }
            ];
        }

        return this.multiplayerManager.getOnlinePlayers()
            .filter(p => p.id && p.id !== this.localPlayer.id)
            .map(p => ({ id: p.id, name: p.name }));
    }
    
    private createPlayerButton(player: { id: string, name: string }) {
        const buttonNode = cc.instantiate(this.playerVoteButtonPrefab);
        this.voteButtonContainer.addChild(buttonNode);
        
        // Set player name
        const nameLabel = buttonNode.getChildByName("NameLabel")?.getComponent(cc.Label);
        if (nameLabel) nameLabel.string = player.name;

        // Add click listener
        buttonNode.on('click', () => this.selectPlayer(player, buttonNode));
        this.voteButtons.set(player.id, buttonNode);
    }

    private selectPlayer(player: { id: string, name: string }, buttonNode: cc.Node) {
        if (this.hasVoted) return;

        this.selectedPlayer = player;
        this.confirmVoteButton.getComponent(cc.Button).interactable = true;
        this.statusLabel.string = `Selected ${player.name}. Press VOTE to confirm.`;
        
        // Show selection border
        const graphics = this.selectionBorder.getComponent(cc.Graphics);
        graphics.clear();
        graphics.rect(-buttonNode.width/2-5, -buttonNode.height/2-5, buttonNode.width+10, buttonNode.height+10);
        graphics.stroke();
        
        this.selectionBorder.parent = buttonNode;
        this.selectionBorder.active = true;
    }

    private onConfirmVoteClicked() {
        if (!this.selectedPlayer || this.hasVoted) return;

        this.hasVoted = true;
        this.lockVotingUI();
        this.statusLabel.string = `Vote cast for ${this.selectedPlayer.name}. Waiting...`;
        
        // Change border color to yellow to show confirmation
        this.selectionBorder.getComponent(cc.Graphics).strokeColor = cc.Color.YELLOW;

        if (!this.testMode) {
            this.submitVoteToFirebase();
        }
    }

    private lockVotingUI() {
        this.voteButtons.forEach(btn => btn.getComponent(cc.Button).interactable = false);
        this.confirmVoteButton.getComponent(cc.Button).interactable = false;
    }

    private startVotingSession() {
        this.remainingTime = this.voteTime;
        this.schedule(this.updateTimer, 1);
        this.updateTimerDisplay(this.remainingTime);

        if (!this.testMode) {
            this.firebaseManager.database.ref(`games/${this.gameId}/voting`).set({
                startTime: firebase.database.ServerValue.TIMESTAMP,
                completed: false
            });
            this.listenForVotes();
        }
    }

    private updateTimer() {
        this.remainingTime--;
        this.updateTimerDisplay(this.remainingTime);
        if (this.remainingTime <= 0) {
            this.endVotingPeriod();
        }
    }

    private updateTimerDisplay(time: number) {
        this.timerLabel.string = `0:${Math.max(0, time).toString().padStart(2, '0')}`;
    }

    private submitVoteToFirebase() {
        const voteRef = this.firebaseManager.database.ref(`games/${this.gameId}/voting/votes/${this.localPlayer.id}`);
        voteRef.set({
            voterName: this.localPlayer.name,
            target: this.selectedPlayer.id
        }).catch(err => cc.error("Error submitting vote:", err));
    }

    private listenForVotes() {
        const votesRef = this.firebaseManager.database.ref(`games/${this.gameId}/voting/votes`);
        votesRef.on('value', (snapshot) => {
            const votes = snapshot.val() || {};
            // End early if all living players (minus local player) have voted
            if (Object.keys(votes).length >= this.multiplayerManager.getOnlinePlayers().length - 1) {
                this.endVotingPeriod();
            }
        });
    }
    
    private async endVotingPeriod() {
        // Prevent multiple calls
        if (this.voteSessionEnded) return;
        this.voteSessionEnded = true;
        
        this.unschedule(this.updateTimer);
        this.lockVotingUI();

        if (this.testMode) {
            // Test mode - use mock data
            this.statusLabel.string = "Votes counted! Revealing results...";
            cc.sys.localStorage.setItem('voteData', JSON.stringify({
                voteCounts: { 'test_2': 2, 'test_3': 1, 'test_4': 0 },
                imposterId: 'test_2',
                crewWins: true
            }));
            cc.sys.localStorage.setItem('lastActivePlayers', JSON.stringify(this.getPlayersForVoting()));
            this.scheduleOnce(() => cc.director.loadScene("EndScene1"), 1.5);
            return;
        }

        // Get votes from Firebase
        const votesSnapshot = await this.firebaseManager.database.ref(`games/${this.gameId}/voting/votes`).once('value');
        await this.processVoteResults(votesSnapshot.val() || {});
    }

    private async processVoteResults(votes: { [key: string]: { target: string } }) {
        // Count votes
        const voteCounts: {[key: string]: number} = {};
        Object.values(votes).forEach(vote => {
            voteCounts[vote.target] = (voteCounts[vote.target] || 0) + 1;
        });

        // Find player with most votes
        let ejectedPlayerId: string = null;
        let maxVotes = 0;
        
        Object.keys(voteCounts).forEach(id => {
            if (voteCounts[id] > maxVotes) {
                maxVotes = voteCounts[id];
                ejectedPlayerId = id;
            } else if (voteCounts[id] === maxVotes) {
                ejectedPlayerId = null; // Tie - no one ejected
            }
        });

        // Handle tie case
        if (!ejectedPlayerId) {
            // Tie handling
            const voteData = {
                voteCounts: voteCounts,
                imposterId: await this.getImposterId(),
                crewWins: false,
                tie: true
            };
            
            cc.sys.localStorage.setItem('voteData', JSON.stringify(voteData));
            cc.sys.localStorage.setItem('lastActivePlayers', JSON.stringify(this.multiplayerManager.getOnlinePlayers()));
            
            this.scheduleOnce(() => cc.director.loadScene("GameScene"), 1.5);
            return;
        }

        // Update Firebase with results
        const gameRef = this.firebaseManager.database.ref(`games/${this.gameId}`);
        await gameRef.child('voting').update({ completed: true, ejectedPlayerId });

        // Get imposter info
        const imposterIdFromDB = await this.getImposterId();
        const wasImposter = ejectedPlayerId === imposterIdFromDB;
        
        // Save data for EndScene
        const voteData = {
            voteCounts: voteCounts,
            imposterId: imposterIdFromDB,
            ejectedPlayerId: ejectedPlayerId,
            crewWins: wasImposter
        };
        
        cc.sys.localStorage.setItem('voteData', JSON.stringify(voteData));
        cc.sys.localStorage.setItem('lastActivePlayers', JSON.stringify(this.multiplayerManager.getOnlinePlayers()));
        
        // Update game state if imposter was ejected
        if (wasImposter) {
            await gameRef.update({ state: "ended", winner: "crew" });
        }
        
        // Load results scene
        this.statusLabel.string = "Votes counted! Revealing results...";
        this.scheduleOnce(() => cc.director.loadScene("EndScene1"), 1.5);
    }

    private async getImposterId(): Promise<string> {
        const snapshot = await this.firebaseManager.database.ref(`games/${this.gameId}/imposter/id`).once('value');
        return snapshot.val();
    }

    onDestroy() {
        if (!this.testMode && this.firebaseManager?.database) {
            this.firebaseManager.database.ref(`games/${this.gameId}/voting/votes`).off();
        }
    }
}