// Multiplayer.ts (Updated)
import FirebaseManager from "./FirebaseManager";
import OtherPlayerScript from "./Other-Player";

const { ccclass, property } = cc._decorator;

export interface PlayerState {
    name: string;
    x: number;
    y: number;
    animation?: string;
    facing?: number;
    online?: boolean;
    lastUpdate?: any;
    character?: string;
    isImposter?: boolean;
    id?: string;
}

const SCRIPT_NAMES = {
    OTHER_PLAYER: 'Other-Player'
};

declare const firebase: any;

@ccclass
export default class MultiplayerManager extends cc.Component {

    @property(cc.Prefab) remotePlayerPrefab: cc.Prefab = null;
    @property(cc.Boolean) enableImposterMode: boolean = true;

    private static instance: MultiplayerManager = null;
    private localPlayerId: string = null;
    private playersRef: firebase.database.Reference = null;
    private remotePlayers: { [id: string]: cc.Node } = {};
    private gameRef: firebase.database.Reference = null;
    private isImposter: boolean = false;

    private allOnlinePlayersData: Map<string, PlayerState> = new Map();
    public static readonly EVENT_ONLINE_PLAYERS_UPDATED = 'online-players-updated';
    
    public isChangingScenes: boolean = false;
    // The isGameSceneActive flag is no longer needed for player creation.
    // private isGameSceneActive: boolean = false; 

    public static getInstance(): MultiplayerManager {
        if (!MultiplayerManager.instance) {
            cc.error("MultiplayerManager instance not available.");
        }
        return MultiplayerManager.instance;
    }

    onLoad() {
        cc.director.on(cc.Director.EVENT_AFTER_SCENE_LAUNCH, this.onSceneLaunched, this);
        if (MultiplayerManager.instance && MultiplayerManager.instance !== this) {
            this.node.destroy();
            return;
        }
        MultiplayerManager.instance = this;
        cc.game.addPersistRootNode(this.node);
        this.isChangingScenes = false;
    }

    start() {
        const firebaseManager = FirebaseManager.getInstance();
        if (!firebaseManager || !firebaseManager.database) {
            cc.error("MultiplayerManager: FirebaseManager not ready!");
            this.enabled = false;
            return;
        }

        this.playersRef = firebaseManager.database.ref("players");
        const gameId = "default_game";
        this.gameRef = firebaseManager.database.ref(`games/${gameId}`);
        
        this.localPlayerId = cc.sys.localStorage.getItem('playerId');

        if (!this.localPlayerId) {
            cc.error("MultiplayerManager: LocalPlayerId not found!");
            this.enabled = false;
            return;
        }
        if (!this.remotePlayerPrefab) {
            cc.error("MultiplayerManager: RemotePlayerPrefab not assigned in Inspector!");
            this.enabled = false;
            return;
        }

        this.initializePlayerListeners();

        if (this.enableImposterMode) {
            this.listenForGameState();
        } else {
            cc.warn("[MultiplayerManager] enableImposterMode is false. Game state listener for scene transition might not work as expected.");
        }
    }

    private initializePlayerListeners() {
        if (!this.playersRef) {
            cc.error("MultiplayerManager: playersRef is null. Cannot listen.");
            return;
        }

        // Fetch initial players once
        this.playersRef.once('value').then(snapshot => {
            const allPlayers = snapshot.val();
            if (allPlayers) {
                Object.keys(allPlayers).forEach(pId => {
                    const pData = allPlayers[pId] as PlayerState;
                    if (pData.online) {
                        this.allOnlinePlayersData.set(pId, { ...pData, id: pId });
                        // Create node for initial online players
                        if (pId !== this.localPlayerId) {
                            this.createRemotePlayerNode(pId, pData);
                        }
                    }
                });
                this.emitOnlinePlayersUpdate();
            }
        }).catch(error => {
            cc.error("[MultiplayerManager] Error fetching initial players:", error);
        });

        // Listen for subsequent changes
        this.playersRef.on('child_added', this.handlePlayerChildAdded, this);
        this.playersRef.on('child_changed', this.handlePlayerChildChanged, this);
        this.playersRef.on('child_removed', this.handlePlayerChildRemoved, this);
    }

    private emitOnlinePlayersUpdate() {
        const playersArray = Array.from(this.allOnlinePlayersData.values());
        this.node.emit(MultiplayerManager.EVENT_ONLINE_PLAYERS_UPDATED, playersArray);
    }

    private handlePlayerChildAdded(snapshot: firebase.database.DataSnapshot) {
        if (this.isChangingScenes) return;
        const playerId = snapshot.key;
        const playerData = snapshot.val() as PlayerState;
        if (!playerId || !playerData) return;

        if (playerData.online) {
            if (!this.allOnlinePlayersData.has(playerId)) {
                this.allOnlinePlayersData.set(playerId, { ...playerData, id: playerId });
                this.emitOnlinePlayersUpdate();
            }
        }

        if (playerId === this.localPlayerId || !playerData.online) return;
        
        if (!this.remotePlayers[playerId]) {
             this.createRemotePlayerNode(playerId, playerData);
        } else {
            this.updateRemotePlayerNode(playerId, playerData);
        }
    }

    private handlePlayerChildChanged(snapshot: firebase.database.DataSnapshot) {
        if (this.isChangingScenes) return;
        const playerId = snapshot.key;
        const playerData = snapshot.val() as PlayerState;
        if (!playerId || !playerData) return;

        const wasPreviouslyInMap = this.allOnlinePlayersData.has(playerId);

        if (playerData.online) {
            this.allOnlinePlayersData.set(playerId, { ...playerData, id: playerId });
        } else {
            if (wasPreviouslyInMap) {
                this.allOnlinePlayersData.delete(playerId);
            }
        }
        this.emitOnlinePlayersUpdate();

        if (playerId === this.localPlayerId) return;
        
        const remotePlayerNode = this.remotePlayers[playerId];

        if (playerData.online) {
            if (remotePlayerNode && remotePlayerNode.isValid) {
                this.updateRemotePlayerNode(playerId, playerData);
            } else {
                // Player came online or node was missing, create it
                this.createRemotePlayerNode(playerId, playerData);
            }
        } else {
            // Player went offline, remove their node
            this.removeRemotePlayer(playerId);
        }
    }

    private handlePlayerChildRemoved(snapshot: firebase.database.DataSnapshot) {
        if (this.isChangingScenes) return;
        const playerId = snapshot.key;
        if (!playerId) return;

        if (this.allOnlinePlayersData.has(playerId)) {
            this.allOnlinePlayersData.delete(playerId);
            this.emitOnlinePlayersUpdate();
        }
        this.removeRemotePlayer(playerId);
    }

    private createRemotePlayerNode(playerId: string, playerData: PlayerState) {
        // --- MODIFICATION ---
        // The check for `!isGameSceneActive` has been removed. Now we only check
        // if we are in the middle of a scene transition.
        if (this.isChangingScenes) {
            cc.log(`[MultiplayerManager] Skipping remote player node creation for ${playerId} during scene change.`);
            return;
        }

        if (this.remotePlayers[playerId] && this.remotePlayers[playerId].isValid) {
            this.updateRemotePlayerNode(playerId, playerData);
            return;
        }

        if (!this.remotePlayerPrefab) {
             cc.error("[MultiplayerManager] RemotePlayerPrefab is not assigned!");
             return;
        }
        cc.log(`[MultiplayerManager] Creating remote player node for ${playerId} in scene: ${cc.director.getScene().name}`);
        const newNode = cc.instantiate(this.remotePlayerPrefab);
        let playersContainer = cc.find("RemotePlayersContainer");
        if (!playersContainer) {
            playersContainer = new cc.Node("RemotePlayersContainer");
            if (cc.director.getScene()) {
                 playersContainer.parent = cc.director.getScene();
            } else {
                cc.error("[MultiplayerManager] Cannot find current scene to parent RemotePlayersContainer.");
                newNode.destroy();
                return;
            }
            cc.log("[MultiplayerManager] Created RemotePlayersContainer node.");
        }
        newNode.parent = playersContainer;
        newNode.setPosition(playerData.x || 0, playerData.y || 0);

        const script = newNode.getComponent(OtherPlayerScript);
        if (script) {
            script.initialize(playerId, playerData);
        } else {
            cc.warn(`MultiplayerManager: Prefab for ${playerId} missing OtherPlayerScript component.`);
        }
        this.remotePlayers[playerId] = newNode;
    }

    private updateRemotePlayerNode(playerId: string, playerData: PlayerState) {
        if (this.isChangingScenes) return;
        const playerNode = this.remotePlayers[playerId];
        if (!playerNode || !playerNode.isValid) {
            if (playerData.online) {
                this.createRemotePlayerNode(playerId, playerData);
            }
            return;
        }
        try {
            const playerScript = playerNode.getComponent(OtherPlayerScript);
            if (playerScript) {
                playerScript.updateState(playerData);
            } else {
                playerNode.setPosition(playerData.x || 0, playerData.y || 0);
            }
        } catch (error) {
            cc.warn(`[MultiplayerManager] Error updating remote player ${playerId}: ${error.message}`);
        }
    }

    private removeRemotePlayer(playerId: string) {
        const node = this.remotePlayers[playerId];
        if (node && node.isValid) {
            node.destroy();
            delete this.remotePlayers[playerId];
            cc.log(`[MultiplayerManager] Removed remote player node for ${playerId}.`);
        }
    }

    public prepareForSceneChange() {
        cc.log("[MultiplayerManager] Preparing for scene change.");
        this.isChangingScenes = true;
    }

    public listenForGameState() {
        if (!this.gameRef) {
            cc.error("[MultiplayerManager] gameRef is NULL. Cannot listen.");
            return;
        }
        
        this.gameRef.on('value', (snapshot) => {
            if (this.isChangingScenes) return;
            
            const gameState = snapshot.val();
            if (!gameState) return;
            
            if (gameState.imposter) {
                this.isImposter = gameState.imposter.id === this.localPlayerId;
                this.node.emit('imposter-assigned', { isImposter: this.isImposter });
                
                const currentSceneName = cc.director.getScene().name;
                if (gameState.state === 'active' && currentSceneName === 'Lobby' && !this.isChangingScenes) {
                    const localPlayerId = this.getLocalPlayerId();
                    const isPlayerInActiveGame = gameState.activePlayers && gameState.activePlayers[localPlayerId];

                    if (isPlayerInActiveGame) {
                        this.prepareForSceneChange();
                        cc.director.loadScene('GameScene');
                    } else {
                         this.node.emit('waiting-for-next-game');
                    }
                }
            } else {
                if ((gameState.state === "ended" || gameState.state === "waiting") && cc.director.getScene().name === "GameScene") {
                     this.prepareForSceneChange();
                     cc.director.loadScene("Lobby");
                }
            }
        });
    }

    public sendPlayerState(playerId: string, state: PlayerState) {
        if (this.isChangingScenes || !this.playersRef || !playerId) return;
        this.playersRef.child(playerId).update(state)
            .catch(err => cc.error(`MultiplayerManager: Error sending state for ${playerId}:`, err));
    }

    public setLocalPlayerOffline(playerId: string) {
        if (!this.playersRef || !playerId) return;
        this.playersRef.child(playerId).update({
            online: false,
            lastUpdate: firebase.database.ServerValue.TIMESTAMP
        }).catch(err => cc.error(`MultiplayerManager: Error setting ${playerId} offline:`, err));
    }

    public assignRandomImposter(): Promise<string | null> {
        const gameId = "default_game";
        const hostId = this.getLocalPlayerId();
        
        if (!hostId) {
            cc.error("[MultiplayerManager] Cannot assign imposter without a localPlayerId.");
            return Promise.resolve(null);
        }

        return FirebaseManager.getInstance().assignImposter(gameId, hostId)
            .catch(err => {
                cc.error('[MultiplayerManager] Error calling FirebaseManager.assignImposter:', err);
                throw err;
            });
    }

    private onSceneLaunched(scene: cc.Scene) {
        cc.log(`[MultiplayerManager] New scene launched: ${scene.name}`);
        this.isChangingScenes = false;

        // Clear all old player nodes from the previous scene
        this.remotePlayers = {};

        if (scene.name === 'GameScene') {
            this.onGameSceneActuallyLoaded(); 
        } else {
            // For Lobby or other scenes, re-initialize online players
            const onlinePlayers = this.getOnlinePlayers();
            onlinePlayers.forEach(p => {
                if (p.id !== this.localPlayerId) {
                    this.createRemotePlayerNode(p.id, p);
                }
            });
        }
    }

    public async onGameSceneActuallyLoaded() {
        cc.log("[MultiplayerManager] Repopulating players for GameScene.");
        this.isChangingScenes = false;

        const firebaseManager = FirebaseManager.getInstance();
        if (!firebaseManager || !firebaseManager.database) return;
        
        const gameId = "default_game";
        try {
            const gameStateSnapshot = await firebaseManager.database.ref(`games/${gameId}`).once('value');
            const gameState = gameStateSnapshot.val();

            if (gameState && gameState.activePlayers) {
                const activePlayerIds = Object.keys(gameState.activePlayers);
                cc.log(`[MultiplayerManager] Found active players for GameScene: ${activePlayerIds.join(', ')}`);

                activePlayerIds.forEach(playerId => {
                    if (playerId === this.localPlayerId) return;

                    const playerData = this.allOnlinePlayersData.get(playerId);
                    if (playerData && playerData.online) {
                        this.createRemotePlayerNode(playerId, playerData);
                    } else {
                        cc.warn(`[MultiplayerManager] Skipping node creation for player ${playerId} not found in online cache.`);
                    }
                });
            }
        } catch (error) {
            cc.error("[MultiplayerManager] Error during onGameSceneActuallyLoaded:", error);
        }
    }
    
    public isPlayerImposter(): boolean { return this.isImposter; }
    public getLocalPlayerId(): string { return this.localPlayerId; }

    public getOnlinePlayers(): PlayerState[] {
        return Array.from(this.allOnlinePlayersData.values());
    }

    onDestroy() {
        cc.director.off(cc.Director.EVENT_AFTER_SCENE_LAUNCH, this.onSceneLaunched, this);
        if (this.playersRef) {
            this.playersRef.off('child_added', this.handlePlayerChildAdded, this);
            this.playersRef.off('child_changed', this.handlePlayerChildChanged, this);
            this.playersRef.off('child_removed', this.handlePlayerChildRemoved, this);
        }
        if (this.gameRef) {
            this.gameRef.off('value');
        }
    }
}