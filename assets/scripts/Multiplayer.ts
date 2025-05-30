// Multiplayer.ts (was MultiplayerManager.ts)
// Attach this script to an empty node in your first scene (e.g., "MultiplayerSystem").
// Set its execution order after FirebaseManager (e.g., -50).
import FirebaseManager from "./FirebaseManager"; // To get initialized database instance

const { ccclass, property } = cc._decorator;

// This interface should be consistent across Player.ts, Multiplayer.ts, and Other-Player.ts
interface PlayerState {
    name: string;
    x: number;
    y: number;
    animation?: string;
    facing?: number;
    online?: boolean;
    lastUpdate?: any; // Can be number (timestamp) or Firebase ServerValue.TIMESTAMP
    // Add any other state you need (e.g., score, health)
}

@ccclass
export default class MultiplayerManager extends cc.Component {

    @property(cc.Prefab)
    remotePlayerPrefab: cc.Prefab = null; // Assign your Remote Player Prefab in the editor

    private static instance: MultiplayerManager = null;
    private localPlayerId: string = null;
    private playersRef: firebase.database.Reference = null;
    private remotePlayers: { [id: string]: cc.Node } = {}; // Store remote player nodes

    public static getInstance(): MultiplayerManager {
        if (!MultiplayerManager.instance) {
            cc.error("MultiplayerManager instance is not yet available. Ensure its node is in the scene and active, and its script execution order is set (e.g., -50).");
        }
        return MultiplayerManager.instance;
    }

    onLoad() {
        cc.log("MultiplayerManager: onLoad started.");
        if (MultiplayerManager.instance && MultiplayerManager.instance !== this) {
            cc.log("MultiplayerManager: Destroying duplicate instance.");
            this.node.destroy();
            return;
        }
        MultiplayerManager.instance = this;
        cc.game.addPersistRootNode(this.node);
        cc.log("MultiplayerManager: Instance set and node persisted.");
    }

    start() {
        cc.log("MultiplayerManager: start() called.");
        const firebaseManager = FirebaseManager.getInstance();
        if (!firebaseManager || !firebaseManager.database) {
            cc.error("MultiplayerManager: FirebaseManager or its database not ready in start()!");
            this.enabled = false;
            return;
        }
        this.playersRef = firebaseManager.database.ref("players");
        cc.log("MultiplayerManager: playersRef initialized.");

        // Retrieve localPlayerId (ensure it's set by Login.ts or Player.ts before this scene/node loads if needed)
        this.localPlayerId = cc.sys.localStorage.getItem('playerId');

        if (!this.localPlayerId) {
            cc.error("MultiplayerManager: Local player ID not found in localStorage during start()!");
            // Decide how to handle this: disable multiplayer, wait, or generate new one.
            // For now, we'll return, but you might need a more robust solution.
            return;
        }
        cc.log(`MultiplayerManager: Local Player ID is ${this.localPlayerId}`);

        if (!this.remotePlayerPrefab) {
            cc.error("MultiplayerManager: Remote Player Prefab not assigned in the editor!");
            this.enabled = false;
            return;
        }

        this.listenForPlayerChanges();
    }

    listenForPlayerChanges() {
        if (!this.playersRef) {
            cc.error("MultiplayerManager: playersRef is null in listenForPlayerChanges. Initialization failed.");
            return;
        }
        cc.log("MultiplayerManager: Setting up Firebase listeners for 'players' node.");

        this.playersRef.on('child_added', (snapshot) => {
            const playerId = snapshot.key;
            const playerData = snapshot.val() as PlayerState;

            if (!playerId || !playerData) {
                cc.warn("MultiplayerManager: child_added received invalid data", snapshot);
                return;
            }

            if (playerId === this.localPlayerId) {
                cc.log(`MultiplayerManager: child_added for local player ${playerId}, ignoring.`);
                return;
            }
            if (!playerData.online) {
                 cc.log(`MultiplayerManager: child_added for ${playerId} but marked offline, ignoring for now.`, playerData);
                return;
            }
            if (this.remotePlayers[playerId]) {
                 cc.log(`MultiplayerManager: Remote player ${playerId} already exists, updating instead of adding.`);
                 // Potentially update state if it exists but wasn't caught by child_changed
                 const remoteNode = this.remotePlayers[playerId];
                 const remoteScript = remoteNode.getComponent('Other-Player'); // Your remote player script name
                 if (remoteScript) {
                     remoteScript.updateState(playerData);
                 }
                return;
            }

            cc.log(`MultiplayerManager: New player joined: ${playerId}`, playerData);
            const newRemotePlayerNode = cc.instantiate(this.remotePlayerPrefab);
            newRemotePlayerNode.parent = cc.director.getScene(); // Or a specific layer for players
            
            const remotePlayerScript = newRemotePlayerNode.getComponent('Other-Player'); // Your remote player script name
            if (remotePlayerScript) {
                remotePlayerScript.initialize(playerId, playerData);
            } else {
                cc.warn(`MultiplayerManager: RemotePlayer prefab for ${playerId} does not have Other-Player.ts script attached.`);
                newRemotePlayerNode.setPosition(playerData.x || 0, playerData.y || 0);
            }
            this.remotePlayers[playerId] = newRemotePlayerNode;
        });

        this.playersRef.on('child_changed', (snapshot) => {
            const playerId = snapshot.key;
            const playerData = snapshot.val() as PlayerState;

            if (!playerId || !playerData) {
                cc.warn("MultiplayerManager: child_changed received invalid data", snapshot);
                return;
            }

            if (playerId === this.localPlayerId) {
                return; // Local player handles its own updates
            }

            const remotePlayerNode = this.remotePlayers[playerId];
            if (remotePlayerNode) {
                if (!playerData.online) {
                    cc.log(`MultiplayerManager: Player ${playerId} data changed to offline. Removing.`);
                    remotePlayerNode.destroy();
                    delete this.remotePlayers[playerId];
                    return;
                }
                // cc.log(`MultiplayerManager: Player data changed: ${playerId}`, playerData); // Can be too verbose
                const remotePlayerScript = remotePlayerNode.getComponent('Other-Player'); // Your remote player script name
                if (remotePlayerScript) {
                    remotePlayerScript.updateState(playerData);
                } else {
                     cc.warn(`MultiplayerManager: RemotePlayer node for ${playerId} missing Other-Player.ts script during update.`);
                    remotePlayerNode.setPosition(playerData.x || 0, playerData.y || 0);
                    // You might want to update other visual properties here too
                }
            } else if (playerData.online) {
                // Player reconnected or was missed by child_added
                cc.log(`MultiplayerManager: Player data changed for ${playerId} (now online), but node not found. Re-creating.`, playerData);
                const newRemotePlayerNode = cc.instantiate(this.remotePlayerPrefab);
                newRemotePlayerNode.parent = cc.director.getScene(); // Or a specific layer
                const remotePlayerScript = newRemotePlayerNode.getComponent('Other-Player'); // Your remote player script name
                if (remotePlayerScript) {
                    remotePlayerScript.initialize(playerId, playerData);
                } else {
                     cc.warn(`MultiplayerManager: RemotePlayer prefab for re-created ${playerId} does not have Other-Player.ts script attached.`);
                    newRemotePlayerNode.setPosition(playerData.x || 0, playerData.y || 0);
                }
                this.remotePlayers[playerId] = newRemotePlayerNode;
            }
        });

        this.playersRef.on('child_removed', (snapshot) => {
            const playerId = snapshot.key;
             if (!playerId) {
                cc.warn("MultiplayerManager: child_removed received invalid data", snapshot);
                return;
            }
            cc.log(`MultiplayerManager: Player removed from Firebase: ${playerId}`);
            const remotePlayerNode = this.remotePlayers[playerId];
            if (remotePlayerNode) {
                remotePlayerNode.destroy();
                delete this.remotePlayers[playerId];
            }
        });
    }

    public sendPlayerState(playerId: string, state: PlayerState) {
        if (!this.playersRef || !playerId) {
            cc.warn("MultiplayerManager: Cannot send player state. playersRef or playerId missing.");
            return;
        }
        // 'lastUpdate' and 'online' are already part of the state object from Player.ts
        this.playersRef.child(playerId).update(state) // Use update() to avoid overwriting onDisconnect or other specific fields
            .catch(err => cc.error("MultiplayerManager: Error sending player state for " + playerId + ":", err));
    }

    public setLocalPlayerOffline(playerId: string) {
        if (!this.playersRef || !playerId) {
            cc.warn("MultiplayerManager: Cannot set local player offline. playersRef or playerId missing.");
            return;
        }
        cc.log(`MultiplayerManager: Setting player ${playerId} to offline in Firebase.`);
        this.playersRef.child(playerId).update({
            online: false,
            lastUpdate: firebase.database.ServerValue.TIMESTAMP
        }).catch(err => cc.error("MultiplayerManager: Error setting player offline for " + playerId + ":", err));
    }
    
    onDestroy() {
        cc.log("MultiplayerManager: onDestroy called.");
        if (this.playersRef) {
            this.playersRef.off('child_added');
            this.playersRef.off('child_changed');
            this.playersRef.off('child_removed');
            cc.log("MultiplayerManager: Firebase listeners removed.");
        }
        // Note: onDisconnect for the local player is handled in Player.ts
        if (MultiplayerManager.instance === this) {
            MultiplayerManager.instance = null;
        }
    }
}