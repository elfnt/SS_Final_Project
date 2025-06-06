// Vote.ts (Shortened)
import MultiplayerManager, { PlayerState } from './Multiplayer';
import FirebaseManager from './FirebaseManager';

const { ccclass, property } = cc._decorator;

@ccclass
export default class VoteManager extends cc.Component {
    // --- Editor Properties ---
    @property(cc.Prefab) playerVoteButtonPrefab: cc.Prefab = null;
    @property(cc.Node) voteButtonContainer: cc.Node = null;
    @property(cc.Label) timerLabel: cc.Label = null;
    @property(cc.Label) statusLabel: cc.Label = null;
    @property(cc.Node) confirmVoteButton: cc.Node = null;
    @property voteTime: number = 30;
    @property testMode: boolean = false;

    // --- Private State ---
    private multiplayerManager: MultiplayerManager = null;
    private firebaseManager: FirebaseManager = null;
    private gameId = "default_game";
    private localPlayer = { id: "", name: "" };
    
    private hasVoted = false;
    private voteButtons = new Map<string, cc.Node>();
    private selectedPlayer: { id: string, name: string } | null = null;
    private selectionBorder: cc.Node = null;

    onLoad() {
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
        this.voteButtonContainer.removeAllChildren();
        this.confirmVoteButton.getComponent(cc.Button).interactable = false;
        this.confirmVoteButton.on('click', this.onConfirmVoteClicked, this);
        this.createSelectionBorder();

        const playersToDisplay = this.getPlayersForVoting();
        playersToDisplay.forEach(p => this.createPlayerButton(p));

        this.statusLabel.string = "Vote for the imposter!";
    }

private getPlayersForVoting(): { id: string, name: string }[] {
        if (this.testMode) {
            return [
                { id: 'test_2', name: 'Red (Sus)' },
                { id: 'test_3', name: 'Green' },
                { id: 'test_4', name: 'Blue' }
            ];
        }

        // The line below is the corrected part
        return this.multiplayerManager.getOnlinePlayers()
            // First, filter out any players that don't have an ID or are the local player
            .filter(p => p.id && p.id !== this.localPlayer.id)
            // Then, map the result to the required {id, name} structure
            .map(p => ({ id: p.id, name: p.name }));
    }
    
    private createPlayerButton(player: { id: string, name: string }) {
        const buttonNode = cc.instantiate(this.playerVoteButtonPrefab);
        this.voteButtonContainer.addChild(buttonNode);
        
        const nameLabel = buttonNode.getChildByName("NameLabel")?.getComponent(cc.Label);
        if (nameLabel) nameLabel.string = player.name;

        buttonNode.on('click', () => this.selectPlayer(player, buttonNode));
        this.voteButtons.set(player.id, buttonNode);
    }

    private createSelectionBorder() {
        this.selectionBorder = new cc.Node("SelectionBorder");
        const graphics = this.selectionBorder.addComponent(cc.Graphics);
        graphics.lineWidth = 5;
        graphics.strokeColor = cc.Color.WHITE;
        // The border size will be set when a player is selected
        this.selectionBorder.active = false;
    }

    private selectPlayer(player: { id: string, name: string }, buttonNode: cc.Node) {
        if (this.hasVoted) return;

        this.selectedPlayer = player;
        this.confirmVoteButton.getComponent(cc.Button).interactable = true;
        this.statusLabel.string = `Selected ${player.name}. Press VOTE to confirm.`;
        
        // Update highlight border
        const graphics = this.selectionBorder.getComponent(cc.Graphics);
        graphics.clear();
        graphics.rect(-buttonNode.width / 2 - 5, -buttonNode.height / 2 - 5, buttonNode.width + 10, buttonNode.height + 10);
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

    private remainingTime: number = 0;

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
            // End early if all living players (minus 1, can't vote for self) have voted
            if (Object.keys(votes).length >= this.multiplayerManager.getOnlinePlayers().length - 1) {
                this.endVotingPeriod();
            }
        });
    }
    
    private async endVotingPeriod() {
        this.unschedule(this.updateTimer);
        this.lockVotingUI();

        if (this.testMode) {
            const target = this.selectedPlayer || this.getPlayersForVoting()[0];
            this.showFinalResults(target, target.id === 'test_2');
            return;
        }

        const votesSnapshot = await this.firebaseManager.database.ref(`games/${this.gameId}/voting/votes`).once('value');
        await this.processVoteResults(votesSnapshot.val() || {});
    }

    private async processVoteResults(votes: { [key: string]: { target: string } }) {
        const voteCounts = new Map<string, number>();
        Object.values(votes).forEach(vote => {
            voteCounts.set(vote.target, (voteCounts.get(vote.target) || 0) + 1);
        });

        let ejectedPlayerId: string | null = null;
        let maxVotes = 0;
        voteCounts.forEach((count, id) => {
            if (count > maxVotes) {
                maxVotes = count;
                ejectedPlayerId = id;
            } else if (count === maxVotes) {
                ejectedPlayerId = null; // In case of a tie, no one is ejected
            }
        });

        if (!ejectedPlayerId) {
            this.statusLabel.string = "Vote tied! No one was ejected.";
            this.scheduleOnce(() => cc.director.loadScene("GameScene"), 3);
            return;
        }

        // Update Firebase with results
        const gameRef = this.firebaseManager.database.ref(`games/${this.gameId}`);
        await gameRef.child('voting').update({ completed: true, ejectedPlayerId });

        const imposterSnapshot = await gameRef.child('imposter/id').once('value');
        const wasImposter = ejectedPlayerId === imposterSnapshot.val();
        
        const ejectedPlayer = this.multiplayerManager.getOnlinePlayers().find(p => p.id === ejectedPlayerId);
        if (ejectedPlayer && ejectedPlayer.id && ejectedPlayer.name) {
            this.showFinalResults({ id: ejectedPlayer.id, name: ejectedPlayer.name }, wasImposter);
        } else {
            this.statusLabel.string = "Ejected player not found.";
        }

        if (wasImposter) {
            await gameRef.update({ state: "ended", winner: "crew" });
        } else {
            this.scheduleOnce(() => cc.director.loadScene("GameScene"), 5);
        }
    }

    private showFinalResults(player: { id: string, name: string }, wasImposter: boolean) {
        this.statusLabel.string = `${player.name} was ${wasImposter ? "" : "NOT "}the Imposter!`;
        if (wasImposter) this.statusLabel.string += "\nCrew Wins!";

        const ejectedButton = this.voteButtons.get(player.id);
        if (ejectedButton) {
            this.selectionBorder.parent = ejectedButton;
            this.selectionBorder.active = true;
            this.selectionBorder.getComponent(cc.Graphics).strokeColor = wasImposter ? cc.Color.RED : cc.Color.GRAY;
        }
    }

    onDestroy() {
        if (!this.testMode && this.firebaseManager?.database) {
            this.firebaseManager.database.ref(`games/${this.gameId}/voting/votes`).off();
        }
    }
}