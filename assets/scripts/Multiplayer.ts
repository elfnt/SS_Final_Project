// Multiplayer.ts (MultiplayerManager class)
import FirebaseManager from "./FirebaseManager"; //
import OtherPlayerScript from "./Other-Player"; // Assuming Other-Player.ts is in the same directory //

const { ccclass, property } = cc._decorator;

export interface PlayerState { //
    name: string; //
    x: number; //
    y: number; //
    animation?: string; //
    facing?: number; //
    online?: boolean; //
    lastUpdate?: any; //
    character?: string; //
    isImposter?: boolean; //
    id?: string; //
}

const SCRIPT_NAMES = { //
    OTHER_PLAYER: 'Other-Player' // Script name string for getComponent //
};

declare const firebase: any; //

@ccclass
export default class MultiplayerManager extends cc.Component {

    @property(cc.Prefab) remotePlayerPrefab: cc.Prefab = null; //
    @property(cc.Boolean) enableImposterMode: boolean = true; // Ensure this is TRUE in Inspector //

    private static instance: MultiplayerManager = null; //
    private localPlayerId: string = null; //
    private playersRef: firebase.database.Reference = null; //
    private remotePlayers: { [id: string]: cc.Node } = {}; //
    private gameRef: firebase.database.Reference = null; //
    private isImposter: boolean = false; //

    private allOnlinePlayersData: Map<string, PlayerState> = new Map(); //
    public static readonly EVENT_ONLINE_PLAYERS_UPDATED = 'online-players-updated'; //
    
    public isChangingScenes: boolean = false; //
    private isGameSceneActive: boolean = false; // Track GameScene active state //

    public static getInstance(): MultiplayerManager { //
        if (!MultiplayerManager.instance) { //
            cc.error("MultiplayerManager instance not available."); //
        }
        return MultiplayerManager.instance; //
    }

    onLoad() { //
        cc.director.on(cc.Director.EVENT_AFTER_SCENE_LAUNCH, this.onSceneLaunched, this); //
        if (MultiplayerManager.instance && MultiplayerManager.instance !== this) { //
            this.node.destroy(); //
            return; //
        }
        MultiplayerManager.instance = this; //
        cc.game.addPersistRootNode(this.node); //
        this.isChangingScenes = false; //
    }

    start() { //
        const firebaseManager = FirebaseManager.getInstance(); //
        if (!firebaseManager || !firebaseManager.database) { //
            cc.error("MultiplayerManager: FirebaseManager not ready!"); //
            this.enabled = false; //
            return; //
        }

        this.playersRef = firebaseManager.database.ref("players"); //
        const gameId = "default_game"; // This must be consistent //
        this.gameRef = firebaseManager.database.ref(`games/${gameId}`); // Point to the specific game session path //
        
        this.localPlayerId = cc.sys.localStorage.getItem('playerId'); //

        if (!this.localPlayerId) { //
            cc.error("MultiplayerManager: LocalPlayerId not found!"); //
            this.enabled = false; //
            return; //
        }
        if (!this.remotePlayerPrefab) { //
            cc.error("MultiplayerManager: RemotePlayerPrefab not assigned in Inspector!"); //
            this.enabled = false; //
            return; //
        }

        this.initializePlayerListeners(); //

        if (this.enableImposterMode) { //
            this.listenForGameState(); //
        } else { //
            cc.warn("[MultiplayerManager] enableImposterMode is false. Game state listener for scene transition might not work as expected."); //
        }
    }

    private initializePlayerListeners() { //
        if (!this.playersRef) { //
            cc.error("MultiplayerManager: playersRef is null. Cannot listen."); //
            return; //
        }

        this.playersRef.once('value').then(snapshot => { //
            const allPlayers = snapshot.val(); //
            if (allPlayers) { //
                Object.keys(allPlayers).forEach(pId => { //
                    const pData = allPlayers[pId] as PlayerState; //
                    if (pData.online) { //
                        this.allOnlinePlayersData.set(pId, { ...pData, id: pId }); //
                    }
                });
                this.emitOnlinePlayersUpdate(); //
            }
        }).catch(error => { //
            cc.error("[MultiplayerManager] Error fetching initial players:", error); //
        });

        this.playersRef.on('child_added', this.handlePlayerChildAdded, this); //
        this.playersRef.on('child_changed', this.handlePlayerChildChanged, this); //
        this.playersRef.on('child_removed', this.handlePlayerChildRemoved, this); //
    }

    private emitOnlinePlayersUpdate() { //
        const playersArray = Array.from(this.allOnlinePlayersData.values()); //
        this.node.emit(MultiplayerManager.EVENT_ONLINE_PLAYERS_UPDATED, playersArray); //
        cc.log(`[MultiplayerManager] Emitted ${MultiplayerManager.EVENT_ONLINE_PLAYERS_UPDATED} with ${playersArray.length} players.`); //
    }

    private handlePlayerChildAdded(snapshot: firebase.database.DataSnapshot) { //
        if (this.isChangingScenes) return; //
        const playerId = snapshot.key; //
        const playerData = snapshot.val() as PlayerState; //
        if (!playerId || !playerData) return; //

        if (playerData.online) { //
            if (!this.allOnlinePlayersData.has(playerId)) { //
                this.allOnlinePlayersData.set(playerId, { ...playerData, id: playerId }); //
                this.emitOnlinePlayersUpdate(); //
            }
        }

        if (playerId === this.localPlayerId || !playerData.online) return; //
        // Only create remote player nodes if we are in the GameScene and it's active
        if (this.isGameSceneActive && !this.remotePlayers[playerId]) { //
             this.createRemotePlayerNode(playerId, playerData); //
        } else if (this.remotePlayers[playerId]) { // Already exists, update it
            this.updateRemotePlayerNode(playerId, playerData); //
        }
    }

    private handlePlayerChildChanged(snapshot: firebase.database.DataSnapshot) { //
        if (this.isChangingScenes) return; //
        const playerId = snapshot.key; //
        const playerData = snapshot.val() as PlayerState; //
        if (!playerId || !playerData) return; //

        const wasPreviouslyInMap = this.allOnlinePlayersData.has(playerId); //

        if (playerData.online) { //
            this.allOnlinePlayersData.set(playerId, { ...playerData, id: playerId }); //
            // No direct emit here; rely on logic below or specific calls to emitOnlinePlayersUpdate
        } else { //
            if (wasPreviouslyInMap) { //
                this.allOnlinePlayersData.delete(playerId); //
            }
        }
        this.emitOnlinePlayersUpdate(); // Emit after any potential change to allOnlinePlayersData //


        if (playerId === this.localPlayerId) return; //
        
        const remotePlayerNode = this.remotePlayers[playerId]; //

        if (remotePlayerNode && remotePlayerNode.isValid) { //
            if (!playerData.online) { //
                this.removeRemotePlayer(playerId); //
            } else {
                this.updateRemotePlayerNode(playerId, playerData); //
            }
        } else if (playerData.online && this.isGameSceneActive) { // If node doesn't exist, but should (online and in game scene)
            cc.log(`[MultiplayerManager] Player ${playerId} changed and became online, creating node in GameScene.`);
            this.createRemotePlayerNode(playerId, playerData); //
        } else if (!playerData.online && remotePlayerNode) { // If player went offline and node still somehow exists
             this.removeRemotePlayer(playerId); //
        }
    }

    private handlePlayerChildRemoved(snapshot: firebase.database.DataSnapshot) { //
        if (this.isChangingScenes) return; //
        const playerId = snapshot.key; //
        if (!playerId) return; //

        if (this.allOnlinePlayersData.has(playerId)) { //
            this.allOnlinePlayersData.delete(playerId); //
            this.emitOnlinePlayersUpdate(); //
        }
        this.removeRemotePlayer(playerId); //
    }

    private createRemotePlayerNode(playerId: string, playerData: PlayerState) { //
        // Do not create if changing scenes or not in an active game scene context
        if (this.isChangingScenes || !this.isGameSceneActive) { //
            cc.log(`[MultiplayerManager] Skipping remote player node creation for ${playerId}. isChangingScenes: ${this.isChangingScenes}, isGameSceneActive: ${this.isGameSceneActive}`);
            return;
        }
        if (this.remotePlayers[playerId] && this.remotePlayers[playerId].isValid) {
            cc.log(`[MultiplayerManager] Remote player node for ${playerId} already exists. Updating instead.`);
            this.updateRemotePlayerNode(playerId, playerData);
            return;
        }

        if (!this.remotePlayerPrefab) { //
             cc.error("[MultiplayerManager] RemotePlayerPrefab is not assigned!"); //
             return; //
        }
        cc.log(`[MultiplayerManager] Creating remote player node for ${playerId} in scene: ${cc.director.getScene().name}`); //
        const newNode = cc.instantiate(this.remotePlayerPrefab); //
        let playersContainer = cc.find("RemotePlayersContainer"); //
        if (!playersContainer) { //
            playersContainer = new cc.Node("RemotePlayersContainer"); //
            // Ensure it's parented to the current scene, not a persistent node if MultiplayerManager is persistent
            if (cc.director.getScene()) {
                 playersContainer.parent = cc.director.getScene(); //
            } else {
                cc.error("[MultiplayerManager] Cannot find current scene to parent RemotePlayersContainer.");
                newNode.destroy(); // Clean up instantiated node
                return;
            }
            cc.log("[MultiplayerManager] Created RemotePlayersContainer node."); //
        }
        newNode.parent = playersContainer; //
        newNode.setPosition(playerData.x || 0, playerData.y || 0); //

        const script = newNode.getComponent(OtherPlayerScript); // Using imported class //
        if (script) { //
            script.initialize(playerId, playerData); //
        } else { //
            cc.warn(`MultiplayerManager: Prefab for ${playerId} missing OtherPlayerScript component.`); //
        }
        this.remotePlayers[playerId] = newNode; //
    }

    private updateRemotePlayerNode(playerId: string, playerData: PlayerState) { //
        if (this.isChangingScenes) return; //
        const playerNode = this.remotePlayers[playerId]; //
        if (!playerNode || !playerNode.isValid) { //
            // If node is invalid but should exist (e.g. player is online and we are in game scene)
            if (playerData.online && this.isGameSceneActive) {
                cc.warn(`[MultiplayerManager] updateRemotePlayerNode: Node for ${playerId} is invalid. Attempting to re-create.`);
                this.createRemotePlayerNode(playerId, playerData); // Attempt to re-create
            } else {
                cc.warn(`[MultiplayerManager] updateRemotePlayerNode: Node for ${playerId} is invalid or missing, and not attempting re-creation.`); //
            }
            return; //
        }
        try { //
            const playerScript = playerNode.getComponent(OtherPlayerScript); // Using imported class //
            if (playerScript) { //
                playerScript.updateState(playerData); // Call updateState //
            } else { //
                 cc.warn(`[MultiplayerManager] OtherPlayerScript not found on node for ${playerId} during update.`); //
                playerNode.setPosition(playerData.x || 0, playerData.y || 0); //
            }
        } catch (error) { //
            cc.warn(`[MultiplayerManager] Error updating remote player ${playerId}: ${error.message}`); //
        }
    }

    private removeRemotePlayer(playerId: string) { //
        const node = this.remotePlayers[playerId]; //
        if (node) { //
            if (node.isValid) { // Check if it's valid before destroying
                node.destroy(); //
            }
            delete this.remotePlayers[playerId]; //
            cc.log(`[MultiplayerManager] Removed remote player node for ${playerId}.`);
        }
    }

    public prepareForSceneChange() { //
        cc.log("[MultiplayerManager] Preparing for scene change. Event listeners might be temporarily less responsive."); //
        this.isChangingScenes = true; //
        this.isGameSceneActive = false; // Explicitly set game scene to inactive during change
    }

    public listenForGameState() { //
        if (!this.gameRef) { //
            cc.error("[MultiplayerManager] gameRef is NULL in listenForGameState. Cannot listen."); //
            return; //
        }
        cc.log(`[MultiplayerManager] listenForGameState: Listening to path: ${this.gameRef.toString()}`); //

        this.gameRef.on('value', (snapshot) => { //
            if (this.isChangingScenes) { //
                 cc.log("[MultiplayerManager] GameState update received during scene change, ignoring."); //
                 return; //
            }
            const gameState = snapshot.val(); //
            cc.log(`[MultiplayerManager] GameState Listener Fired. Raw GameState from Firebase:`, JSON.stringify(gameState)); //

            if (!gameState) { //
                cc.log("[MultiplayerManager] GameState is null or undefined from Firebase."); //
                return; //
            }
            
            if (gameState.imposter) { //
                cc.log(`[MultiplayerManager] Imposter found in gameState: ${gameState.imposter}`); //
                this.isImposter = gameState.imposter === this.localPlayerId; //
                this.node.emit('imposter-assigned', { isImposter: this.isImposter }); //
                
                const currentSceneName = cc.director.getScene().name; //
                cc.log(`[MultiplayerManager] Checking conditions for scene load: gameState.state = "${gameState.state}", currentSceneName = "${currentSceneName}"`); //

                if (gameState.state === 'active' && currentSceneName === 'Lobby' && !this.isChangingScenes) { // Check 'active' and ensure not already changing scene //
                    const localPlayerId = this.getLocalPlayerId(); //
                    const isPlayerInActiveGame = gameState.activePlayers && gameState.activePlayers[localPlayerId]; //

                    if (isPlayerInActiveGame) { //
                        cc.log(`[MultiplayerManager] Conditions MET for ${localPlayerId}. Player is in active game. Loading GameScene...`); //
                        this.prepareForSceneChange(); // Set flag before loading //
                        try { //
                            cc.director.loadScene('GameScene'); //
                        } catch (e) { //
                            cc.error(`[MultiplayerManager] Error loading scene: ${e.message}`); //
                            this.isChangingScenes = false; // Reset flag if error //
                            this.isGameSceneActive = (cc.director.getScene().name === 'GameScene'); // Re-evaluate based on actual scene
                        }
                    } else { //
                         cc.log(`[MultiplayerManager] Player ${localPlayerId} is NOT in activePlayers list. Staying in lobby.`); //
                         this.node.emit('waiting-for-next-game'); //
                    }
                } else { //
                    cc.log("[MultiplayerManager] Conditions for scene load NOT MET or already changing scenes."); //
                    if (gameState.state !== 'active') cc.log(`  - Reason: gameState.state is "${gameState.state}", expected "active"`); //
                    if (currentSceneName !== 'Lobby') cc.log(`  - Reason: currentSceneName is "${currentSceneName}", expected "Lobby"`); //
                    if (this.isChangingScenes) cc.log(`  - Reason: isChangingScenes is true.`); //
                }
            } else { //
                cc.log("[MultiplayerManager] No 'imposter' field in gameState or gameState.imposter is null."); //
                // If game ends and returns to lobby, and imposter field is cleared, this path might be taken.
                // Handle game state 'ended' or 'waiting' to reset lobby UI or clean up game scene if needed.
                if (gameState.state === "ended" || gameState.state === "waiting") {
                    if (cc.director.getScene().name === "GameScene") {
                         cc.log("[MultiplayerManager] Game ended or reset to waiting. Transitioning to Lobby if not already there.");
                         this.prepareForSceneChange();
                         cc.director.loadScene("Lobby"); // Or your main menu/lobby scene name
                    } else if (cc.director.getScene().name === "Lobby") {
                        this.isGameSceneActive = false; // Ensure flag is correct if already in lobby
                        this.isChangingScenes = false; // Reset if a loop occurred
                    }
                }

            }
        }, (errorObject: Error) => { //
            cc.error("[MultiplayerManager] Error listening to gameRef:", errorObject.message); //
        });
    }
    
    public getPlayerJoinTime(playerId: string): number | null { // Return null if not found //
        const joinTimeStr = cc.sys.localStorage.getItem(`player_${playerId}_joinTime`); //
        return joinTimeStr ? parseInt(joinTimeStr) : null; //
    }

    public setPlayerJoinTime(playerId: string): number { //
        const now = Date.now(); //
        cc.sys.localStorage.setItem(`player_${playerId}_joinTime`, now.toString()); //
        return now; //
    }

    public sendPlayerState(playerId: string, state: PlayerState) { //
        if (this.isChangingScenes) return; //
        if (!this.playersRef || !playerId) return; //
        this.playersRef.child(playerId).update(state) //
            .catch(err => cc.error(`MultiplayerManager: Error sending state for ${playerId}:`, err)); //
    }

    public setLocalPlayerOffline(playerId: string) { //
        if (!this.playersRef || !playerId) return; //
        this.playersRef.child(playerId).update({ //
            online: false, //
            lastUpdate: firebase.database.ServerValue.TIMESTAMP //
        }).catch(err => cc.error(`MultiplayerManager: Error setting ${playerId} offline:`, err)); //
    }

    public assignRandomImposter() { //
        const gameId = "default_game"; //
        return FirebaseManager.getInstance().assignImposter(gameId) //
            .then(imposterId => { //
                if (imposterId) { //
                    cc.log(`[MultiplayerManager] Imposter assignment process successfully initiated by FirebaseManager. Imposter: ${imposterId}`); //
                    return imposterId; //
                } else { //
                    cc.warn('[MultiplayerManager] FirebaseManager.assignImposter returned null (e.g., not enough players).'); //
                    return null; //
                }
            })
            .catch(err => { //
                cc.error('[MultiplayerManager] Error calling FirebaseManager.assignImposter:', err); //
                throw err; // Re-throw to be caught by LobbyManager if needed //
            });
    }

    private onSceneLaunched() { //
        const currentSceneName = cc.director.getScene().name; //
        cc.log(`[MultiplayerManager] New scene launched: ${currentSceneName}`); //

        if (currentSceneName === 'GameScene') { //
            cc.log("[MultiplayerManager] GameScene detected after launch. Calling onGameSceneActuallyLoaded()."); //
            this.onGameSceneActuallyLoaded(); 
        } else if (currentSceneName === 'Lobby') { //
            this.isGameSceneActive = true; // Reset flag //
            this.isChangingScenes = false; // Ensure this is reset if returning to lobby
            // Clear remote game players specific to GameScene if any weren't auto-cleaned.
            // onGameSceneActuallyLoaded already clears remotePlayers, but if lobby needs different handling:
            for (const playerId in this.remotePlayers) {
                if (this.remotePlayers[playerId] && this.remotePlayers[playerId].isValid) {
                    this.remotePlayers[playerId].destroy();
                }
            }
            this.remotePlayers = {}; // Reset for the lobby context if needed
            this.emitOnlinePlayersUpdate(); // Update player counts for lobby UI
        }
    }

// In Multiplayer.ts

public async onGameSceneActuallyLoaded() {
    cc.log("[MultiplayerManager] GameScene has loaded. Clearing old remote players and re-populating.");

    // 1. Clear existing remote player references from the previous scene
    this.remotePlayers = {}; // Reset the dictionary

    // Set flags after clearing old state and before creating new state for the scene
    this.isGameSceneActive = true;
    this.isChangingScenes = false;
    cc.log("[MultiplayerManager] Flags reset: isGameSceneActive=true, isChangingScenes=false.");

    const firebaseManager = FirebaseManager.getInstance();
    if (!firebaseManager || !firebaseManager.database) {
        cc.error("[MultiplayerManager] FirebaseManager not ready in onGameSceneActuallyLoaded.");
        this.emitOnlinePlayersUpdate(); // Emit with current (likely empty) data
        return;
    }
    const gameId = "default_game";

    try {
        const gameStateSnapshot = await firebaseManager.database.ref(`games/${gameId}`).once('value');
        const gameState = gameStateSnapshot.val();

        if (gameState && gameState.activePlayers) {
            const activePlayerIds = Object.keys(gameState.activePlayers);
            cc.log(`[MultiplayerManager] Found active players for GameScene from gameState: ${activePlayerIds.join(', ')}`);

            const creationPromises = activePlayerIds.map(async (playerId) => {
                if (playerId === this.localPlayerId) return; // Skip local player

                let playerData = this.allOnlinePlayersData.get(playerId);

                // If player data is not in local cache OR is marked offline in local cache,
                // but they are listed in the game's activePlayers, try to fetch fresh data.
                if (!playerData || !playerData.online) {
                    cc.warn(`[MultiplayerManager] Player ${playerId} data missing or offline in local cache (allOnlinePlayersData). Attempting to fetch fresh data from Firebase players/${playerId}.`);
                    try {
                        const playerSnapshot = await firebaseManager.database.ref(`players/${playerId}`).once('value');
                        const freshPlayerData = playerSnapshot.val() as PlayerState;

                        if (freshPlayerData && freshPlayerData.online) {
                            playerData = { ...freshPlayerData, id: playerId };
                            // Update the local cache with this fresh, valid data
                            this.allOnlinePlayersData.set(playerId, playerData);
                            cc.log(`[MultiplayerManager] Successfully fetched and cached fresh online data for ${playerId}.`);
                        } else {
                            cc.warn(`[MultiplayerManager] Fetched data for ${playerId} from players/${playerId} is still null or player is not online.`);
                            playerData = null; // Ensure it remains null if fetch showed player is indeed not online
                        }
                    } catch (fetchError) {
                        cc.error(`[MultiplayerManager] Error fetching fresh data for player ${playerId}:`, fetchError);
                        playerData = null; // Ensure it's null on error
                    }
                }

                // Now, attempt to create the node if we have valid, online player data
                if (playerData && playerData.online) {
                    cc.log(`[MultiplayerManager] Conditions MET for creating node for ${playerId}.`);
                    this.createRemotePlayerNode(playerId, playerData);
                } else {
                    cc.warn(`[MultiplayerManager] Final check: Skipping node creation for player ${playerId} as no valid online data could be confirmed.`);
                }
            });
            await Promise.all(creationPromises); // Wait for all player creation attempts to complete
        } else {
            cc.log("[MultiplayerManager] No active players found in gameState for GameScene, or gameState is null.");
        }
    } catch (error) {
        cc.error("[MultiplayerManager] Error during onGameSceneActuallyLoaded:", error);
    }
    // Emit an update after attempting to create all players.
    // This will reflect the players who were successfully created.
    this.emitOnlinePlayersUpdate();
}

    public isPlayerImposter(): boolean { return this.isImposter; } //
    public getLocalPlayerId(): string { return this.localPlayerId; } //

    public getOnlinePlayers(): PlayerState[] { //
        return Array.from(this.allOnlinePlayersData.values()); //
    }

    onDestroy() { //
        cc.director.off(cc.Director.EVENT_AFTER_SCENE_LAUNCH, this.onSceneLaunched, this); //
        if (this.playersRef) { //
            this.playersRef.off('child_added', this.handlePlayerChildAdded, this); //
            this.playersRef.off('child_changed', this.handlePlayerChildChanged, this); //
            this.playersRef.off('child_removed', this.handlePlayerChildRemoved, this); //
        }
        if (this.gameRef) { //
            this.gameRef.off('value'); //
        }
        if (MultiplayerManager.instance === this) { //
            MultiplayerManager.instance = null; //
        }
        this.allOnlinePlayersData.clear(); //
        // Clean up remote players dictionary and nodes if not already handled
        for (const playerId in this.remotePlayers) {
            if (this.remotePlayers[playerId] && this.remotePlayers[playerId].isValid) {
                this.remotePlayers[playerId].destroy();
            }
        }
        this.remotePlayers = {};
    }
}