// LobbyManager.ts (from file with isLoadingScene flag)
import MultiplayerManager, { PlayerState } from './Multiplayer'; //
import FirebaseManager from './FirebaseManager'; //

const { ccclass, property } = cc._decorator;

@ccclass
export default class LobbyManager extends cc.Component {
    @property(cc.Label)
    gameIdLabel: cc.Label = null; //

    @property(cc.Button)
    startGameButton: cc.Button = null; //

    @property(cc.Label)
    waitingLabel: cc.Label = null; //
    
    private multiplayerManager: MultiplayerManager = null; //
    private isWaitingForNextGame: boolean = false; //
    private isLoadingScene: boolean = false; // Flag to prevent multiple start attempts by this client //
    private _keyDownHandler: (event: cc.Event.EventKeyboard) => void; //


    start() { //
        this._keyDownHandler = (event: cc.Event.EventKeyboard) => { //
            if (event.keyCode === cc.macro.KEY.s) { //
                cc.log("[LobbyManager] EMERGENCY START via keyboard shortcut"); //
                this.onStartGameClicked(); //
            }
        };
        cc.systemEvent.on(cc.SystemEvent.EventType.KEY_DOWN, this._keyDownHandler, this); //
        
        this.multiplayerManager = MultiplayerManager.getInstance(); //

        if (this.startGameButton) { //
            this.startGameButton.node.off('click'); //
            this.startGameButton.node.on('click', () => { //
                cc.log("[LobbyManager] Start Button clicked."); //
                this.onStartGameClicked(); //
            }, this);
            this.startGameButton.interactable = false; //
            cc.log("[LobbyManager] Start button click handler registered"); //
        }

        if (this.waitingLabel) { //
            this.waitingLabel.string = "Waiting for players... (0/4)"; //
        }

        if (this.multiplayerManager) { //
            this.checkForActiveGame(); //

            this.multiplayerManager.node.on( //
                MultiplayerManager.EVENT_ONLINE_PLAYERS_UPDATED, //
                this.onOnlinePlayersUpdated, //
                this
            );
            
            this.multiplayerManager.node.on('waiting-for-next-game', this.onWaitingForNextGame, this); //
            
            const initialPlayers = this.multiplayerManager.getOnlinePlayers(); //
            this.onOnlinePlayersUpdated(initialPlayers || []); //
        } else { //
            cc.error("[LobbyManager] MultiplayerManager instance not found."); //
            if (this.waitingLabel) { //
                this.waitingLabel.string = "Error: Multiplayer not ready."; //
            }
        }
    }

    checkForActiveGame() { //
        const gameId = "default_game"; //
        FirebaseManager.getInstance().database.ref(`games/${gameId}`).once('value') //
            .then(snapshot => { //
                const gameData = snapshot.val(); //
                
                if (gameData && gameData.state === "active") { //
                    const localPlayerId = this.multiplayerManager.getLocalPlayerId(); //
                    const isPlayerInActiveGame = gameData.activePlayers && gameData.activePlayers[localPlayerId]; //
                    
                    if (isPlayerInActiveGame) { //
                        cc.log("[LobbyManager] Player is in active game player list. Will wait for MM to transition."); //
                        // MultiplayerManager's listenForGameState should handle the transition for this player
                    } else { //
                        cc.log("[LobbyManager] Active game found, but player not in activePlayers list. Waiting for next game."); //
                        this.onWaitingForNextGame(); //
                    }
                } else { //
                    cc.log("[LobbyManager] No active game found, proceeding with normal lobby setup."); //
                }
            })
            .catch(err => { //
                cc.error("[LobbyManager] Error checking for active game:", err); //
            });
    }

    onWaitingForNextGame() { //
        this.isWaitingForNextGame = true; //
        if (this.waitingLabel) { //
            this.waitingLabel.string = "Game in progress. Please wait for next round."; //
        }
        if (this.startGameButton) { //
            this.startGameButton.interactable = false; //
        }
        this.monitorCurrentGameCompletion(); //
    }
    
    monitorCurrentGameCompletion() { //
        const gameId = "default_game"; //
        const gameListener = (snapshot: firebase.database.DataSnapshot) => { //
            const state = snapshot.val(); //
            if (state === "ended" || state === "waiting") { //
                cc.log("[LobbyManager] Current game ended or reset to waiting state. Ready for new players."); //
                this.isWaitingForNextGame = false; //
                if (this.waitingLabel) { //
                    const currentPlayers = this.multiplayerManager.getOnlinePlayers(); //
                    this.waitingLabel.string = `Waiting for players... (${currentPlayers.length}/4)`; //
                }
                FirebaseManager.getInstance().database.ref(`games/${gameId}/state`).off('value', gameListener); // Detach self //
                this.onOnlinePlayersUpdated(this.multiplayerManager.getOnlinePlayers() || []); // Re-evaluate button state
            }
        };
        FirebaseManager.getInstance().database.ref(`games/${gameId}/state`).on('value', gameListener); //
    }

    onOnlinePlayersUpdated(players: PlayerState[]) { //
        const onlinePlayerCount = players.length; //

        if (!this.isWaitingForNextGame) { //
            if (this.waitingLabel) { //
                this.waitingLabel.string = `Players: ${onlinePlayerCount} / 4`; //
            }
            if (this.startGameButton) { //
                const canStart = onlinePlayerCount >= 4; //
                this.startGameButton.interactable = canStart; //
                cc.log(`[LobbyManager] Setting start button interactable: ${canStart} (${onlinePlayerCount}/4 players)`); //
            }
        }
        //cc.log(`[LobbyManager] UI updated. Online players: ${onlinePlayerCount}`); //
    }

    onStartGameClicked() { //
        cc.log("[LobbyManager] onStartGameClicked initiated."); //
        if (this.isLoadingScene) { //
            cc.log("[LobbyManager] Scene loading already in progress or game start initiated, ignoring click"); //
            return; //
        }
        if (!this.multiplayerManager) { //
            cc.error("[LobbyManager] MultiplayerManager not available to start game."); //
            return; //
        }
        
        const currentOnlinePlayers = this.multiplayerManager.getOnlinePlayers(); //
        cc.log(`[LobbyManager] Attempting to start game with ${currentOnlinePlayers.length} players`); //
        
        if (currentOnlinePlayers.length >= 4) { //
            this.isLoadingScene = true; // Prevent further clicks by this client //
            this.startGameButton.interactable = false; // Disable button immediately

            const gameId = "default_game"; //
            const hostId = this.multiplayerManager.getLocalPlayerId(); //
            
            cc.log(`[LobbyManager] Initiating game start process. Game ID: ${gameId}, Host: ${hostId}`); //
            
            const activePlayers = {}; //
            currentOnlinePlayers.slice(0, 4).forEach(player => { //
                if (player.id) { //
                    activePlayers[player.id] = true; //
                }
            });
            
            FirebaseManager.getInstance().database.ref(`games/${gameId}`).update({ //
                hostId: hostId, //
                activePlayers: activePlayers, //
                state: "waiting" // Set to waiting, assignImposter will set it to active
            }).then(() => { //
                cc.log(`[LobbyManager] Game session updated with active players. Requesting imposter assignment...`); //
                return this.multiplayerManager.assignRandomImposter(); //
            })
            .then(imposterId => { //
                if (imposterId) { //
                    cc.log(`[LobbyManager] Imposter assigned: ${imposterId}. Firebase state updated. MultiplayerManager will handle scene transition.`); //
                    // DO NOT call cc.director.loadScene here.
                    // MultiplayerManager.listenForGameState on ALL clients will detect state:"active"
                    // and trigger the scene load.
                } else { //
                    cc.warn('[LobbyManager] Failed to assign imposter (returned null from MM).'); //
                    this.isLoadingScene = false; // Reset flag if imposter assignment failed //
                    this.startGameButton.interactable = (this.multiplayerManager.getOnlinePlayers().length >=4); // Re-enable button if possible
                }
            })
            .catch(err => { //
                cc.error('[LobbyManager] Error during game start process:', err); //
                this.isLoadingScene = false; // Reset flag on error //
                this.startGameButton.interactable = (this.multiplayerManager.getOnlinePlayers().length >=4); // Re-enable button
            });
        } else { //
            cc.warn(`[LobbyManager] Not enough players to start the game: ${currentOnlinePlayers.length}/4`); //
        }
    }
    
    onDestroy() { //
        if (this._keyDownHandler) { //
            cc.systemEvent.off(cc.SystemEvent.EventType.KEY_DOWN, this._keyDownHandler, this); //
        }
        if (this.startGameButton && this.startGameButton.node && this.startGameButton.node.isValid) { //
            this.startGameButton.node.off('click'); //
        }
        if (this.multiplayerManager && this.multiplayerManager.node && this.multiplayerManager.node.isValid) { //
            this.multiplayerManager.node.off( //
                MultiplayerManager.EVENT_ONLINE_PLAYERS_UPDATED, //
                this.onOnlinePlayersUpdated, //
                this
            );
            this.multiplayerManager.node.off('waiting-for-next-game', this.onWaitingForNextGame, this); //
             const gameId = "default_game"; //
             const gameListenerPath = `games/${gameId}/state`; //
             try { //
                FirebaseManager.getInstance().database.ref(gameListenerPath).off('value'); // Attempt to remove specific listener by path
             } catch(e) { /* ignore */ }
        }
    }
}