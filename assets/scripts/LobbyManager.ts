// LobbyManager.ts (Updated)
import MultiplayerManager, { PlayerState } from './Multiplayer';
import FirebaseManager from './FirebaseManager';

const { ccclass, property } = cc._decorator;

@ccclass
export default class LobbyManager extends cc.Component {
    @property(cc.Label)
    gameIdLabel: cc.Label = null;

    @property(cc.Button)
    startGameButton: cc.Button = null;

    @property(cc.Label)
    waitingLabel: cc.Label = null;
    
    private multiplayerManager: MultiplayerManager = null;
    private isWaitingForNextGame: boolean = false;
    private isLoadingScene: boolean = false; // Flag to prevent multiple start attempts
    private _keyDownHandler: (event: cc.Event.EventKeyboard) => void;


    start() {
        this._keyDownHandler = (event: cc.Event.EventKeyboard) => {
            if (event.keyCode === cc.macro.KEY.s) {
                cc.log("[LobbyManager] EMERGENCY START via keyboard shortcut");
                this.onStartGameClicked();
            }
        };
        cc.systemEvent.on(cc.SystemEvent.EventType.KEY_DOWN, this._keyDownHandler, this);
        
        this.multiplayerManager = MultiplayerManager.getInstance();

        if (this.startGameButton) {
            cc.log("[LobbyManager] Setting up start button click handler");
            this.startGameButton.node.off('click');
            
            // Use a direct callback to match exactly how the 'S' key works
            this.startGameButton.node.on('click', () => {
                cc.log("[LobbyManager] Start button clicked!");
                this.onStartGameClicked();
            }, this);
            
            // Always make the button interactable - just like the 'S' key
            this.startGameButton.interactable = true;
        }

        if (this.waitingLabel) {
            this.waitingLabel.string = "Waiting for players... (0/4)";
        }

        if (this.multiplayerManager) {
            this.checkForActiveGame();
            this.multiplayerManager.node.on(
                MultiplayerManager.EVENT_ONLINE_PLAYERS_UPDATED,
                this.onOnlinePlayersUpdated,
                this
            );
            this.multiplayerManager.node.on('waiting-for-next-game', this.onWaitingForNextGame, this);
            this.onOnlinePlayersUpdated(this.multiplayerManager.getOnlinePlayers() || []);
        } else {
            cc.error("[LobbyManager] MultiplayerManager instance not found.");
            if (this.waitingLabel) {
                this.waitingLabel.string = "Error: Multiplayer not ready.";
            }
        }
    }

    checkForActiveGame() {
        const gameId = "default_game";
        FirebaseManager.getInstance().database.ref(`games/${gameId}`).once('value')
            .then(snapshot => {
                const gameData = snapshot.val();
                
                if (gameData && gameData.state === "active") {
                    const localPlayerId = this.multiplayerManager.getLocalPlayerId();
                    const isPlayerInActiveGame = gameData.activePlayers && gameData.activePlayers[localPlayerId];
                    
                    if (!isPlayerInActiveGame) {
                        cc.log("[LobbyManager] Active game found, but player not in it. Waiting for next game.");
                        this.onWaitingForNextGame();
                    }
                }
            })
            .catch(err => {
                cc.error("[LobbyManager] Error checking for active game:", err);
            });
    }

    onWaitingForNextGame() {
        this.isWaitingForNextGame = true;
        if (this.waitingLabel) {
            this.waitingLabel.string = "Game in progress. Please wait for next round.";
        }
        if (this.startGameButton) {
            // Even when waiting, keep the button interactive for EMERGENCY start
            this.startGameButton.interactable = true;
        }
        this.monitorCurrentGameCompletion();
    }
    
    monitorCurrentGameCompletion() {
        const gameId = "default_game";
        const gameRef = FirebaseManager.getInstance().database.ref(`games/${gameId}/state`);
        const gameListener = (snapshot: firebase.database.DataSnapshot) => {
            const state = snapshot.val();
            if (state === "ended" || state === "waiting" || !state) {
                cc.log("[LobbyManager] Current game ended or reset. Ready for new game.");
                this.isWaitingForNextGame = false;
                if (this.waitingLabel) {
                    const currentPlayers = this.multiplayerManager.getOnlinePlayers();
                    this.waitingLabel.string = `Waiting for players... (${currentPlayers.length}/4)`;
                }
                gameRef.off('value', gameListener); // Detach self
                this.onOnlinePlayersUpdated(this.multiplayerManager.getOnlinePlayers() || []);
            }
        };
        gameRef.on('value', gameListener);
    }

    onOnlinePlayersUpdated(players: PlayerState[]) {
        const onlinePlayerCount = players.length;
        cc.log(`[LobbyManager] Online players updated: ${onlinePlayerCount}/4`);
        if (this.isWaitingForNextGame) return;

        if (this.waitingLabel) {
            this.waitingLabel.string = `Players: ${onlinePlayerCount} / 4`;
        }
        
        // No need to toggle button interactable state - always enabled like 'S' key
    }

    onStartGameClicked() {
        cc.log("[LobbyManager] onStartGameClicked initiated.");
        if (this.isLoadingScene) {
            cc.log("[LobbyManager] Game start already in progress, ignoring click.");
            return;
        }
        if (!this.multiplayerManager) {
            cc.error("[LobbyManager] MultiplayerManager not available to start game.");
            return;
        }
        
        const playerCount = this.multiplayerManager.getOnlinePlayers().length;
        
        // Still show the warning but attempt to start anyway (just like 'S' key)
        if (playerCount < 4) {
            cc.warn(`[LobbyManager] Not enough players to start the game (${playerCount}/4), but attempting to start anyway.`);
        } else {
            cc.log(`[LobbyManager] Starting game with ${playerCount} players.`);
        }
        
        // Proceed with game start
        this.isLoadingScene = true;
        
        // Disable button temporarily while loading to prevent spam-clicking
        if (this.startGameButton) {
            this.startGameButton.interactable = false;
        }

        cc.log("[LobbyManager] Requesting game start via MultiplayerManager...");
        
        this.multiplayerManager.assignRandomImposter()
            .then(imposterId => {
                if (imposterId) {
                    cc.log(`[LobbyManager] Game start process successful. Imposter ID: ${imposterId}`);
                    // Scene transition is handled by MultiplayerManager's listener
                } else {
                    cc.warn('[LobbyManager] Failed to start game - no imposter assigned.');
                    this.isLoadingScene = false;
                    if (this.startGameButton) {
                        this.startGameButton.interactable = true;
                    }
                }
            })
            .catch(err => {
                cc.error('[LobbyManager] Error during game start process:', err);
                this.isLoadingScene = false;
                if (this.startGameButton) {
                    this.startGameButton.interactable = true;
                }
            });
    }
    
    onDestroy() {
        if (this._keyDownHandler) {
            cc.systemEvent.off(cc.SystemEvent.EventType.KEY_DOWN, this._keyDownHandler, this);
        }
        if (this.multiplayerManager && this.multiplayerManager.node && this.multiplayerManager.node.isValid) {
            this.multiplayerManager.node.off(MultiplayerManager.EVENT_ONLINE_PLAYERS_UPDATED, this.onOnlinePlayersUpdated, this);
            this.multiplayerManager.node.off('waiting-for-next-game', this.onWaitingForNextGame, this);
        }
        // It's good practice to turn off listeners, but the one in monitorCurrentGameCompletion already detaches itself.
    }
}