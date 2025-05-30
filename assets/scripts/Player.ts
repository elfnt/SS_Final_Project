// Player.ts (Local Player Controller for Multiplayer)
import MultiplayerManager from "./Multiplayer"; // Your MultiplayerManager.ts file
import AutoRespawn from "./respawn"; // 請確保路徑正確


const { ccclass, property } = cc._decorator;

declare const firebase: any; // For Firebase v8 SDK (global 'firebase' object)

interface PlayerState {
    name: string;
    x: number;
    y: number;
    animation?: string;
    facing?: number;
    online: boolean;
    lastUpdate: any;
    // Add other game-specific states if needed
}

const characterMap = {
    mario: 0,
    chick1: 1,
    chick2: 2,
    chick3: 3
};

@ccclass
export default class Player extends cc.Component {
    @property moveSpeed = 200;
    @property jumpHeight = 150;
    @property({ type: cc.Node }) cameraNode: cc.Node = null;
    @property({ type: cc.AudioClip }) jumpSound: cc.AudioClip = null;
    @property({ type: cc.AudioClip }) deathSound: cc.AudioClip = null;
    @property itemDetectRadius = 100;
    @property playerName: string = "Player";
    @property syncInterval: number = 0.1; // Time in seconds between Firebase updates
    //@property([cc.SpriteFrame])
    @property([cc.AnimationClip]) characterDefaultClips: cc.AnimationClip[] = [];
    @property([cc.AnimationClip]) characterMoveClips: cc.AnimationClip[] = [];
    @property([cc.AnimationClip]) characterJumpClips: cc.AnimationClip[] = [];
    characterSprites: cc.SpriteFrame[] = [];
    private anim: cc.Animation = null;
    private rb: cc.RigidBody = null;
    private dir = cc.v2(0, 0);
    private isOnGround = false;
    private isJumping = false;
    private isDead = false;
    private playerNameLabel: cc.Label = null;
    private playerId: string = ""; // Unique ID for this player
    private timeSinceLastSync: number = 0;
    private physicsGravityY: number = 0;

    private heldItem: cc.Node = null;
    private nearestItem: cc.Node = null;
    private originalWorldScale: cc.Vec2 = null;
    private originalItemFixedRotation: boolean = null;
    private originalItemFriction: number = null;
    private lastFacing: number = 1;

    private respawnPoint: cc.Vec2 = null;
    private multiplayerManager: MultiplayerManager = null;

    onLoad() {
        cc.log("[Player] onLoad started.");
        cc.log("[Player] onLoad started.");

        this.applyCharacterFromSelection();

        this.anim = this.getComponent(cc.Animation);
        this.rb = this.getComponent(cc.RigidBody);
        cc.director.getPhysicsManager().enabled = true;
        if (this.rb) this.rb.fixedRotation = true;
        this.physicsGravityY = Math.abs(cc.director.getPhysicsManager().gravity.y);

        this.retrievePlayerIdAndName(); // Sets this.playerId and this.playerName
        this.createNameLabel();
        this.addKeyListeners();

        this.respawnPoint = this.node.getPosition().clone();
        cc.log(`[Player] Initial respawn point set to: (${this.respawnPoint.x}, ${this.respawnPoint.y})`);

        this.multiplayerManager = MultiplayerManager.getInstance();
        if (!this.multiplayerManager) {
            cc.error("[Player] MultiplayerManager instance not found in onLoad! Ensure it's in the scene and script execution order is correct.");
            this.enabled = false;
            return;
        }

        if (!this.playerId) {
            cc.error("[Player] PlayerID is not set after retrievePlayerIdAndName! Cannot initialize multiplayer features.");
            this.enabled = false;
            return;
        }
        cc.log(`[Player] ${this.playerId} (${this.playerName}) is ready for multiplayer.`);

        this.setupOnDisconnect();

        // Send initial state to mark player as online immediately and visible to others
        this.sendCurrentStateToFirebase(true);
        this.timeSinceLastSync = 0;
    }

    private applyCharacterFromSelection() {
        const selectedCharacter = cc.sys.localStorage.getItem("selectedCharacter") || "mario";
        const index = characterMap[selectedCharacter] ?? 0;

        const sprite = this.getComponent(cc.Sprite);
        const anim = this.getComponent(cc.Animation);

        const scaleMap = [
            4,  // mario 正常比例
            0.08,  // chick1 比例較大
            0.08,  // chick2
            0.08   // chick3
        ];
        this.node.setScale(scaleMap[index], scaleMap[index]);

    const collider = this.getComponent(cc.PhysicsBoxCollider);
    if (collider) {
        switch (selectedCharacter) {
            case "mario":
                collider.size = new cc.Size(16, 16);
                collider.offset = cc.v2(0, 0); // 讓腳底貼地
                break;
            case "chick1":
                collider.size = new cc.Size(16, 16);
                collider.offset = cc.v2(0, -300); // 根據實際圖像調整
                break;
            case "chick2":
                collider.size = new cc.Size(16, 16);
                collider.offset = cc.v2(0, -14);
                break;
            case "chick3":
                collider.size = new cc.Size(16, 16);
                collider.offset = cc.v2(0, -13);
                break;
        }
        collider.apply();
    }

        if (this.characterSprites[index]) {
            sprite.spriteFrame = this.characterSprites[index];
            (sprite as any)._refreshAssembler?.();
        }

        if (anim) {
            //anim.clips = []; // 先清掉原本動畫
            anim.addClip(this.characterDefaultClips[index], "Default");
            anim.addClip(this.characterMoveClips[index], "Move");
            anim.addClip(this.characterJumpClips[index], "Jump");
            anim.defaultClip = this.characterDefaultClips[index];
            anim.play("Default");
        }

        cc.log(`[Player] 已套用角色：${selectedCharacter}（index=${index}）`);
    }



    retrievePlayerIdAndName() {
        // Use playerId from localStorage if available (set by Login.ts)
        this.playerId = cc.sys.localStorage.getItem('playerId');
        this.playerName = cc.sys.localStorage.getItem('playerName') || this.playerName; // Use default if not found

        if (!this.playerId) {
            // Fallback if not set by Login scene (e.g., direct entry to GameScene for testing)
            this.playerId = `player_${Date.now()}_${Math.floor(Math.random() * 10000)}`;
            cc.sys.localStorage.setItem('playerId', this.playerId);
            cc.warn(`[Player] Generated new PlayerID: ${this.playerId} as none was found in localStorage.`);
             if (!cc.sys.localStorage.getItem('playerName')) { // If name also wasn't set
                cc.sys.localStorage.setItem('playerName', this.playerName);
             }
        } else {
            cc.log(`[Player] Retrieved PlayerID: ${this.playerId}, Name: ${this.playerName} from localStorage.`);
        }

        // For potential global access by other scripts if absolutely necessary, though direct passing or managers are better.
        if (typeof window !== 'undefined') {
            window['playerId'] = this.playerId;
            window['playerName'] = this.playerName;
        }
    }

    setupOnDisconnect() {
        if (typeof firebase === 'undefined' || !firebase.database) {
            cc.error("[Player] Firebase Database is not available for onDisconnect setup. FirebaseManager might not have run, or script execution order is incorrect.");
            return;
        }
        cc.log(`[Player] Setting up onDisconnect for ${this.playerId}`);
        const playerRef = firebase.database().ref(`players/${this.playerId}`);
        playerRef.onDisconnect().update({ // Use update to only change these fields
            online: false,
            lastUpdate: firebase.database.ServerValue.TIMESTAMP
        })
        .then(() => cc.log(`[Player] onDisconnect handler set for ${this.playerId}.`))
        .catch(err => cc.error(`[Player] Error setting onDisconnect for ${this.playerId}:`, err));
    }

    onDestroy() {
        cc.log(`[Player] ${this.playerId} onDestroy called.`);
        this.removeKeyListeners();
        if (this.playerId && this.multiplayerManager) {
            cc.log(`[Player] Marking ${this.playerId} as offline due to onDestroy.`);
            this.multiplayerManager.setLocalPlayerOffline(this.playerId);
        }
        // Optionally cancel onDisconnect if it was set and you want to prevent it from firing
        // if this is a graceful shutdown. Often, letting it fire is fine.
        // if (typeof firebase !== 'undefined' && firebase.database && this.playerId) {
        //     firebase.database().ref(`players/${this.playerId}`).onDisconnect().cancel();
        // }
    }

    update(dt: number) {
        if (this.isDead || !this.playerId || !this.multiplayerManager) return;

        this.moveHorizontal();
        this.updateCamera();
        this.updateAnim();
        this.detectNearestItem();

        this.node.angle = 0;
        if (this.rb) this.rb.angularVelocity = 0;

        this.updateNamePosition();

        this.timeSinceLastSync += dt;
        if (this.timeSinceLastSync >= this.syncInterval) {
            this.sendCurrentStateToFirebase();
            this.timeSinceLastSync = 0;
        }
    }

    private sendCurrentStateToFirebase(isInitial: boolean = false) {
        if (!this.playerId || !this.multiplayerManager) {
            // This can happen if MultiplayerManager failed to initialize or PlayerID is missing
            // cc.warn("[Player] Cannot send state: PlayerID or MultiplayerManager missing.");
            return;
        }

        const state: PlayerState = {
            name: this.playerName,
            x: Math.round(this.node.x),
            y: Math.round(this.node.y),
            animation: this.anim?.currentClip?.name || "Default",
            facing: this.node.scaleX > 0 ? 1 : -1,
            online: true, // Player sending state is online
            lastUpdate: firebase.database.ServerValue.TIMESTAMP // Firebase server timestamp
        };

        this.multiplayerManager.sendPlayerState(this.playerId, state);

        // if (isInitial) {
        //     cc.log(`[Player] Initial state sent for ${this.playerId}:`, state);
        // } else if (Math.random() < 0.05) { // Log ~5% of updates to reduce spam
        //    cc.log(`[Player] Periodic state sent for ${this.playerId}`);
        // }
    }

    private createNameLabel() {
        if (this.node.getChildByName("PlayerNameLabel")) return; // Avoid duplicate labels

        const lblNode = new cc.Node("PlayerNameLabel");
        this.node.addChild(lblNode);
        this.playerNameLabel = lblNode.addComponent(cc.Label);
        this.playerNameLabel.string = this.playerName;
        this.playerNameLabel.fontSize = 15;
        this.playerNameLabel.node.color = cc.Color.WHITE;
        this.updateNamePosition();
        cc.log("[Player] Name label created for:", this.playerName);
    }

    private updateNamePosition() {
        if (!this.playerNameLabel) return;
        const playerSprite = this.getComponent(cc.Sprite);
        const playerHeight = playerSprite ? playerSprite.node.height * Math.abs(this.node.scaleY) : 64;
        this.playerNameLabel.node.position = cc.v3(0, playerHeight / 2 + 10, 0); // Position above the player

        const sX = this.node.scaleX;
        this.playerNameLabel.node.scaleX = Math.abs(this.playerNameLabel.node.scaleX) * (sX === 0 ? 1 : Math.sign(sX));
    }

    // --- Existing Player Logic (movement, items, etc.) ---
    // Make sure these methods don't conflict with the multiplayer state updates.
    // The state sent to Firebase (position, animation) should reflect the results of these actions.

    private moveHorizontal() {
        if (this.rb) this.rb.linearVelocity = cc.v2(this.dir.x * this.moveSpeed, this.rb.linearVelocity.y);
    }

    private jump() {
        if (!this.rb || !this.isOnGround) return;
        this.isOnGround = false; this.isJumping = true;
        this.rb.linearVelocity = cc.v2(this.rb.linearVelocity.x, Math.sqrt(2 * this.physicsGravityY * this.jumpHeight));
        if (this.jumpSound) cc.audioEngine.playEffect(this.jumpSound, false);
    }

    private addKeyListeners() {
        cc.systemEvent.on(cc.SystemEvent.EventType.KEY_DOWN, this.onKeyDown, this);
        cc.systemEvent.on(cc.SystemEvent.EventType.KEY_UP, this.onKeyUp, this);
    }

    private removeKeyListeners() {
        cc.systemEvent.off(cc.SystemEvent.EventType.KEY_DOWN, this.onKeyDown, this);
        cc.systemEvent.off(cc.SystemEvent.EventType.KEY_UP, this.onKeyUp, this);
    }

    private onKeyDown(e: cc.Event.EventKeyboard) {
        if (this.isDead) return;
        const absScaleX = Math.abs(this.node.scaleX) || 1;
        switch (e.keyCode) {
            case cc.macro.KEY.a: this.dir.x = -1; this.lastFacing = -1; this.node.scaleX = -absScaleX; break;
            case cc.macro.KEY.d: this.dir.x = 1; this.lastFacing = 1; this.node.scaleX = absScaleX; break;
            case cc.macro.KEY.space: if (this.isOnGround) this.jump(); break;
            case cc.macro.KEY.e:
                if (this.heldItem) this.dropItem();
                else if (this.nearestItem && this.dir.x === 0) this.pickUpItem(this.nearestItem);
                break;
        }
    }

    private onKeyUp(e: cc.Event.EventKeyboard) {
        if (this.isDead) return;
        if ((e.keyCode === cc.macro.KEY.a && this.dir.x === -1) || (e.keyCode === cc.macro.KEY.d && this.dir.x === 1)) this.dir.x = 0;
    }

    private updateCamera() {
         if (this.cameraNode) {
            // Center camera on player - assuming camera is at the root of the scene or a direct child of it.
            // Adjust if your camera setup is different (e.g. camera is child of a node that moves)
            this.cameraNode.x = this.node.x;
            this.cameraNode.y = this.node.y;
            // Your original was: this.cameraNode.setPosition(this.node.x - cc.winSize.width / 2, this.node.y - cc.winSize.height / 2);
            // This assumes the camera's anchor point is (0,0) and it moves to keep player at center of screen.
            // If your camera node's anchor point is (0.5, 0.5), then this.cameraNode.setPosition(this.node.position) would be simpler.
            // For now, I'll keep a simple follow.
        }
    }

    private updateAnim() {
        const animName = this.isDead ? "Die" : this.isJumping ? "Jump" : this.dir.x !== 0 ? "Move" : "Default";
        if (this.anim && (this.anim.currentClip?.name !== animName || !this.anim.getAnimationState(animName).isPlaying)) {
            this.anim.play(animName);
        }
    }

    onBeginContact(contact: cc.PhysicsContact, selfCol: cc.PhysicsCollider, otherCol: cc.PhysicsCollider) {
        if (this.isDead) return;
        if (otherCol.node.name.toLowerCase().includes("laser")) {
            cc.log("[Player] Hit laser — triggering death.");
            this.die();
        }

        if (otherCol.node.group === "Ground" || otherCol.node.group === "Item") {
            const worldManifold = contact.getWorldManifold();
            const normal = worldManifold.normal;
            // Check if contact normal is pointing upwards from player's perspective (player landing on something)
            // Or, if the normal from the other object is pointing downwards onto the player
            if (normal.y < -0.5 && contact.isTouching()) { // Your original logic
                 this.isOnGround = true; this.isJumping = false;
            }
        }
    }

    onEndContact(contact: cc.PhysicsContact, selfCol: cc.PhysicsCollider, otherCol: cc.PhysicsCollider) {
        if (otherCol.node.group === "Ground") this.isOnGround = false;
    }

    private detectNearestItem() {
        const items: cc.Node[] = []; this.gatherItems(cc.director.getScene(), items);
        let newNearest: cc.Node = null, minSqrD = this.itemDetectRadius * this.itemDetectRadius;
        for (const item of items) {
            if (item === this.heldItem || !item.activeInHierarchy) continue;
            const sqrD = this.node.position.sub(item.position).magSqr();
            if (sqrD < minSqrD) { minSqrD = sqrD; newNearest = item; }
        }
        if (this.nearestItem !== newNearest) {
            if (this.nearestItem) this.highlight(this.nearestItem, false);
            this.nearestItem = newNearest;
            if (this.nearestItem) this.highlight(this.nearestItem, true);
        }
    }

    private gatherItems(n: cc.Node, out: cc.Node[]) {
        if (n.group === 'Item' && n.activeInHierarchy) out.push(n);
        n.children.forEach(c => this.gatherItems(c, out));
    }

    private highlight(n: cc.Node, on: boolean) {
        if (!n) return;
        n.color = on ? cc.Color.YELLOW : cc.Color.WHITE;
        n.opacity = on ? 230 : 255;
    }

    private pickUpItem(item: cc.Node) {
        this.heldItem = item; this.highlight(item, false);
        this.originalWorldScale = cc.v2(item.scaleX * (item.parent ? item.parent.scaleX : 1), item.scaleY * (item.parent ? item.parent.scaleY : 1));
        const rb = item.getComponent(cc.RigidBody); const col = item.getComponent(cc.PhysicsBoxCollider);
        if (rb) {
            this.originalItemFixedRotation = rb.fixedRotation; rb.enabled = true;
            rb.type = cc.RigidBodyType.Dynamic; rb.fixedRotation = true;
            rb.linearVelocity = cc.Vec2.ZERO; rb.angularVelocity = 0;
        }
        if (col) { this.originalItemFriction = col.friction; col.friction = 100; col.apply(); }
        item.active = false;
    }

    private dropItem() {
        if (!this.heldItem) return;
        this.heldItem.active = true;
        const facing = this.dir.x !== 0 ? this.dir.x : this.lastFacing;
        const dropPos = this.node.position.add(cc.v3(100 * facing, -10, 0));
        this.heldItem.parent = this.node.parent; // Assumes player and items share the same root parent in the scene
        this.heldItem.setPosition(dropPos.x, dropPos.y);
        if (this.originalWorldScale && this.heldItem.parent) {
             this.heldItem.setScale(
                 this.originalWorldScale.x / this.heldItem.parent.scaleX,
                 this.originalWorldScale.y / this.heldItem.parent.scaleY
             );
        } else if (this.originalWorldScale) {
            this.heldItem.setScale(this.originalWorldScale);
        }
        const rb = this.heldItem.getComponent(cc.RigidBody); const col = this.heldItem.getComponent(cc.PhysicsBoxCollider);
        if (rb && this.originalItemFixedRotation !== null) { rb.fixedRotation = this.originalItemFixedRotation; this.originalItemFixedRotation = null; }
        if (col && this.originalItemFriction !== null) { col.friction = this.originalItemFriction; col.apply(); this.originalItemFriction = null; }
        this.heldItem = null; this.nearestItem = null; this.originalWorldScale = null;
    }

    // Your existing respawn/die logic
    public die() {
        if (this.isDead) return;

        this.isDead = true;
        this.dir.x = 0;

        if (this.rb) {
            this.rb.linearVelocity = cc.Vec2.ZERO;
            this.rb.enabled = false;
        }

        cc.log(`[Player] ${this.playerName} died.`);

        if (this.deathSound) {
            cc.audioEngine.playEffect(this.deathSound, false);
        }

        

        this.scheduleOnce(() => {
            this.respawn();
        }, 2);
    }

    
    public respawn() {
        // 重設自身位置
        this.node.setPosition(this.respawnPoint.x, this.respawnPoint.y);

        if (this.rb) {
            this.rb.enabled = true;
            this.rb.linearVelocity = cc.v2(0, 0);
            this.rb.angularVelocity = 0;
        }

        // 重設內部狀態
        this.isDead = false;
        this.isJumping = false;
        this.isOnGround = true;
        this.dir.x = 0;

        this.sendCurrentStateToFirebase(true);
        cc.log(`[Player] ${this.playerName} respawned.`);

        // ✅ 廣播事件，讓 Dropbox 知道要 reset
        cc.systemEvent.emit("PLAYER_RESPAWNED");
    }


}