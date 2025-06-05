// Multiplayer.ts
import FirebaseManager from "./FirebaseManager";

const { ccclass, property } = cc._decorator;

interface PlayerState {
    name: string;
    x: number;
    y: number;
    animation?: string;
    facing?: number;
    online?: boolean;
    lastUpdate?: any;
    character?: string;
}

const SCRIPT_NAMES = { // Consider moving to GameConstants.ts
    OTHER_PLAYER: 'Other-Player'
};

declare const firebase: any;

@ccclass
export default class MultiplayerManager extends cc.Component {

    @property(cc.Prefab) remotePlayerPrefab: cc.Prefab = null;
    // @property(cc.Node) remotePlayerContainer: cc.Node = null; // Optional: for better scene organization

    private static instance: MultiplayerManager = null;
    private localPlayerId: string = null;
    private playersRef: firebase.database.Reference = null;
    private remotePlayers: { [id: string]: cc.Node } = {};

    public static getInstance(): MultiplayerManager {
        if (!MultiplayerManager.instance) {
            cc.error("MultiplayerManager instance not available.");
        }
        return MultiplayerManager.instance;
    }

    onLoad() {
        if (MultiplayerManager.instance && MultiplayerManager.instance !== this) {
            cc.log("MultiplayerManager: Destroying duplicate instance.");
            this.node.destroy();
            return;
        }
        MultiplayerManager.instance = this;
        cc.game.addPersistRootNode(this.node);
        // cc.log("MultiplayerManager: Instance set and persisted.");
    }

    start() {
        const firebaseManager = FirebaseManager.getInstance();
        if (!firebaseManager || !firebaseManager.database) {
            cc.error("MultiplayerManager: FirebaseManager not ready!");
            this.enabled = false;
            return;
        }
        this.playersRef = firebaseManager.database.ref("players");
        this.localPlayerId = cc.sys.localStorage.getItem('playerId');

        if (!this.localPlayerId) {
            cc.error("MultiplayerManager: LocalPlayerId not found!");
            this.enabled = false; // Added to prevent further issues
            return;
        }
        if (!this.remotePlayerPrefab) {
            cc.error("MultiplayerManager: RemotePlayerPrefab not assigned!");
            this.enabled = false;
            return;
        }
        // if (!this.remotePlayerContainer) cc.warn("MultiplayerManager: RemotePlayerContainer not assigned. Defaulting to scene root.");
        // cc.log(`MultiplayerManager: Started for ${this.localPlayerId}`);
        this.listenForPlayerChanges();
    }

    listenForPlayerChanges() {
        if (!this.playersRef) {
            cc.error("MultiplayerManager: playersRef is null. Cannot listen.");
            return;
        }
        // cc.log("MultiplayerManager: Setting up Firebase listeners.");
        this.playersRef.on('child_added', this.handleRemotePlayerAdded, this);
        this.playersRef.on('child_changed', this.handleRemotePlayerChanged, this);
        this.playersRef.on('child_removed', this.handleRemotePlayerRemoved, this);
    }

    private handleRemotePlayerAdded(snapshot: firebase.database.DataSnapshot) {
        const playerId = snapshot.key;
        const playerData = snapshot.val() as PlayerState;

        if (!this.isValidPlayerData(playerId, playerData, 'added', snapshot)) return;
        if (playerId === this.localPlayerId || !playerData.online) return;

        if (this.remotePlayers[playerId]) {
            // cc.log(`MultiplayerManager: Player ${playerId} (added) already exists, updating.`);
            this.updateRemotePlayerNode(this.remotePlayers[playerId], playerId, playerData);
            return;
        }
        // cc.log(`MultiplayerManager: Player ${playerId} joined.`, playerData);
        this.createRemotePlayerNode(playerId, playerData);
    }

    private handleRemotePlayerChanged(snapshot: firebase.database.DataSnapshot) {
        const playerId = snapshot.key;
        const playerData = snapshot.val() as PlayerState;

        if (!this.isValidPlayerData(playerId, playerData, 'changed', snapshot)) return;
        if (playerId === this.localPlayerId) return;

        const remotePlayerNode = this.remotePlayers[playerId];
        if (remotePlayerNode) {
            if (!playerData.online) {
                this.removeRemotePlayer(playerId, `offline`);
                return;
            }
            this.updateRemotePlayerNode(remotePlayerNode, playerId, playerData);
        } else if (playerData.online) {
            // cc.log(`MultiplayerManager: Player ${playerId} (changed/online) not found. Re-creating.`, playerData);
            this.createRemotePlayerNode(playerId, playerData);
        }
    }

    private handleRemotePlayerRemoved(snapshot: firebase.database.DataSnapshot) {
        const playerId = snapshot.key;
        if (!playerId) {
            cc.warn("MultiplayerManager: child_removed invalid ID", snapshot);
            return;
        }
        this.removeRemotePlayer(playerId, `removed from Firebase`);
    }

    private isValidPlayerData(playerId: string | null, playerData: PlayerState | null, eventType: string, snapshot: firebase.database.DataSnapshot): boolean {
        if (!playerId || !playerData) {
            cc.warn(`MultiplayerManager: Invalid data for ${snapshot.key} on ${eventType}`, snapshot.val());
            return false;
        }
        return true;
    }

    private createRemotePlayerNode(playerId: string, playerData: PlayerState) {
        if (!this.remotePlayerPrefab) return; // Should be caught in start, but good check
        const newNode = cc.instantiate(this.remotePlayerPrefab);
        // newNode.parent = this.remotePlayerContainer || cc.director.getScene();
        newNode.parent = cc.director.getScene(); // Current behavior

        const script = newNode.getComponent(SCRIPT_NAMES.OTHER_PLAYER);
        if (script) {
            script.initialize(playerId, playerData);
        } else {
            cc.warn(`MultiplayerManager: Prefab for ${playerId} missing ${SCRIPT_NAMES.OTHER_PLAYER} script.`);
            newNode.setPosition(playerData.x || 0, playerData.y || 0);
        }
        this.remotePlayers[playerId] = newNode;
    }

    private updateRemotePlayerNode(node: cc.Node, playerId: string, playerData: PlayerState) {
        const script = node.getComponent(SCRIPT_NAMES.OTHER_PLAYER);
        if (script) {
            script.updateState(playerData);
        } else {
            cc.warn(`MultiplayerManager: Node for ${playerId} missing ${SCRIPT_NAMES.OTHER_PLAYER} script for update.`);
            node.setPosition(playerData.x || 0, playerData.y || 0);
        }
    }

    private removeRemotePlayer(playerId: string, reason: string) {
        const node = this.remotePlayers[playerId];
        if (node) {
            // cc.log(`MultiplayerManager: Removing ${playerId} (Reason: ${reason}).`);
            node.destroy();
            delete this.remotePlayers[playerId];
        } else {
            // cc.log(`MultiplayerManager: Attempted remove for ${playerId} (Reason: ${reason}), node not found.`);
        }
    }

    public sendPlayerState(playerId: string, state: PlayerState) {
        if (!this.playersRef || !playerId) {
            cc.warn("MultiplayerManager: Cannot send state. Ref/ID missing.");
            return;
        }
        this.playersRef.child(playerId).update(state)
            .catch(err => cc.error(`MultiplayerManager: Error sending state for ${playerId}:`, err));
    }

    public setLocalPlayerOffline(playerId: string) {
        if (!this.playersRef || !playerId) {
            cc.warn("MultiplayerManager: Cannot set offline. Ref/ID missing.");
            return;
        }
        // cc.log(`MultiplayerManager: Setting ${playerId} offline.`);
        this.playersRef.child(playerId).update({
            online: false,
            lastUpdate: firebase.database.ServerValue.TIMESTAMP
        }).catch(err => cc.error(`MultiplayerManager: Error setting ${playerId} offline:`, err));
    }
    
    onDestroy() {
        // cc.log("MultiplayerManager: onDestroy.");
        if (this.playersRef) {
            this.playersRef.off('child_added', this.handleRemotePlayerAdded, this);
            this.playersRef.off('child_changed', this.handleRemotePlayerChanged, this);
            this.playersRef.off('child_removed', this.handleRemotePlayerRemoved, this);
            // cc.log("MultiplayerManager: Firebase listeners removed.");
        }
        if (MultiplayerManager.instance === this) {
            MultiplayerManager.instance = null;
        }
    }
}