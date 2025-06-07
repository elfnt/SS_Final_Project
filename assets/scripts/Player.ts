// Player.ts (Final Version)
import MultiplayerManager from "./Multiplayer";
import FirebaseManager from "./FirebaseManager";
// --- UPDATED: Import the separate controller scripts ---
import ItemController from "./ItemController";
import BoxController from "./BoxController";

const { ccclass, property } = cc._decorator;

declare const firebase: any;

interface PlayerState {
    name: string;
    x: number;
    y: number;
    animation?: string;
    facing?: number;
    online: boolean;
    lastUpdate: any;
    character?: string;
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
    @property({ type: cc.AudioClip }) pickUpSound: cc.AudioClip = null;
    @property({ type: cc.AudioClip }) dropItemSound: cc.AudioClip = null;
    @property itemDetectRadius = 100;
    @property playerName: string = "Player";
    @property syncInterval: number = 0.1;
    @property([cc.AnimationClip]) characterDefaultClips: cc.AnimationClip[] = [];
    @property([cc.AnimationClip]) characterMoveClips: cc.AnimationClip[] = [];
    @property([cc.AnimationClip]) characterJumpClips: cc.AnimationClip[] = [];
    @property([cc.SpriteFrame]) characterSprites: cc.SpriteFrame[] = [];
    @property(cc.Prefab) smokeEffectPrefab: cc.Prefab = null;
    @property(cc.Prefab) walkSmokePrefab: cc.Prefab = null;

    private walkSmokeTimer: number = 0;
    private walkSmokeInterval: number = 0.12;
    private anim: cc.Animation = null;
    private rb: cc.RigidBody = null;
    private dir = cc.v2(0, 0);
    private isOnGround = false;
    private isJumping = false;
    private isDead = false;
    private playerNameLabel: cc.Label = null;
    public playerId: string = "";
    private timeSinceLastSync: number = 0;
    private physicsGravityY: number = 0;

    private heldItem: cc.Node = null;
    private nearestItem: cc.Node = null;
    private lastFacing: number = 1;

    private respawnPoint: cc.Vec2 = null;
    private multiplayerManager: MultiplayerManager = null;

    private currentAnim: string = "";
    private selectedCharacter: string = "mario";
    private isLocalPlayerImposter: boolean = false;

    onLoad() {
        this.applyCharacterFromSelection();

        this.anim = this.getComponent(cc.Animation);
        this.rb = this.getComponent(cc.RigidBody);
        cc.director.getPhysicsManager().enabled = true;
        if (this.rb) this.rb.fixedRotation = true;

        this.physicsGravityY = Math.abs(cc.director.getPhysicsManager().gravity.y);

        this.retrievePlayerIdAndName();
        this.createNameLabel();
        this.addKeyListeners();

        this.respawnPoint = this.node.getPosition().clone();

        this.multiplayerManager = MultiplayerManager.getInstance();
        if (!this.multiplayerManager) {
            cc.error("[Player] MultiplayerManager instance not found!");
            this.enabled = false;
            return;
        }

        this.multiplayerManager.node.on('imposter-assigned', ({ isImposter }) => {
            this.isLocalPlayerImposter = isImposter;
            if (this.playerNameLabel) {
                this.playerNameLabel.node.color = isImposter ? cc.Color.RED : cc.Color.WHITE;
            }
        }, this);
        
        if (this.multiplayerManager.isPlayerImposter()) {
            this.isLocalPlayerImposter = true;
            if (this.playerNameLabel) {
                this.playerNameLabel.node.color = cc.Color.RED;
            }
        }
        
        if (!this.playerId) {
            cc.error("[Player] PlayerID is not set! Cannot initialize multiplayer features.");
            this.enabled = false;
            return;
        }
        
        this.setupOnDisconnect();
        this.sendCurrentStateToFirebase(true);
    }
    
    onDestroy() {
        this.removeKeyListeners();
        if (this.multiplayerManager && this.multiplayerManager.node && this.multiplayerManager.node.isValid) {
            this.multiplayerManager.node.off('imposter-assigned', undefined, this);
        }
        if (this.playerId && this.multiplayerManager) {
            this.multiplayerManager.setLocalPlayerOffline(this.playerId);
        }
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
        if (this.dir.x !== 0 && this.isOnGround) {
            this.walkSmokeTimer += dt;
            if (this.walkSmokeTimer >= this.walkSmokeInterval) {
                this.spawnWalkSmoke();
                this.walkSmokeTimer = 0;
            }
        } else {
            this.walkSmokeTimer = this.walkSmokeInterval;
        }
        this.timeSinceLastSync += dt;
        if (this.timeSinceLastSync >= this.syncInterval) {
            this.sendCurrentStateToFirebase();
            this.timeSinceLastSync = 0;
        }
    }

    onBeginContact(contact: cc.PhysicsContact, selfCol: cc.PhysicsCollider, otherCol: cc.PhysicsCollider) {
        if (this.isDead) return;

        if (otherCol.node.name.toLowerCase().includes("laser")) {
            const laserCol = otherCol.getComponent(cc.PhysicsBoxCollider);
            if (laserCol && !laserCol.enabled) {
                return;
            }
            this.die();
        }

        if (otherCol.node.group === "Ground" || otherCol.node.group === "Item" || otherCol.node.group === "Player") {
            const worldManifold = contact.getWorldManifold();
            const normal = worldManifold.normal;
            if (normal.y < -0.5 && contact.isTouching()) {
                this.isOnGround = true;
                this.isJumping = false;
            }
        }
    }

    onEndContact(contact: cc.PhysicsContact, selfCol: cc.PhysicsCollider, otherCol: cc.PhysicsCollider) {
        if (otherCol.node.group === "Ground" || otherCol.node.group === "Player") {
            this.isOnGround = false;
        }
    }

    private onKeyDown(e: cc.Event.EventKeyboard) {
        if (this.isDead) return;
        switch (e.keyCode) {
            case cc.macro.KEY.a: this.dir.x = -1; this.lastFacing = -1;this.node.scaleX = -Math.abs(this.node.scaleX); break;
            case cc.macro.KEY.d: this.dir.x = 1; this.lastFacing = 1; this.node.scaleX = Math.abs(this.node.scaleX); break;
            case cc.macro.KEY.space: if (this.isOnGround) this.jump(); break;
            case cc.macro.KEY.e:
                if (this.heldItem) this.dropItem();
                else if (this.nearestItem) this.pickUpItem(this.nearestItem);
                break;
        }
    }

    private onKeyUp(e: cc.Event.EventKeyboard) {
        if (this.isDead) return;
        if ((e.keyCode === cc.macro.KEY.a && this.dir.x === -1) || (e.keyCode === cc.macro.KEY.d && this.dir.x === 1)) this.dir.x = 0;
    }

    // --- UPDATED: Item interaction logic now uses the correct architecture ---

    private gatherItems(n: cc.Node, out: cc.Node[]) {
        // Correctly find any node that has either an ItemController or a BoxController
        // NOTE: The class name in your BoxController file is "BoxLogicController"
        if ((n.getComponent("ItemController") || n.getComponent("BoxLogicController")) && n.activeInHierarchy) {
            out.push(n);
        }
        n.children.forEach(c => this.gatherItems(c, out));
    }

    private pickUpItem(item: cc.Node) {
        // This logic assumes only simple items (with ItemController) are pickupable
        const itemScript = item.getComponent(ItemController);
        if (!itemScript) {
            return;
        }

        // The Player script tells the item's script what to do.
        // It does NOT write to Firebase for the item.
        itemScript.onPickedUpByPlayer();

        // Visually hold the item locally
        this.heldItem = item;
        this.heldItem.active = false;
        if (this.pickUpSound) cc.audioEngine.playEffect(this.pickUpSound, false);
    }
    
    private dropItem() {
        if (!this.heldItem) return;

        const itemScript = this.heldItem.getComponent(ItemController);
        if (!itemScript) { 
            this.heldItem = null; 
            return; 
        }

        const dropPos = this.node.position.add(cc.v3(100 * this.lastFacing, 0, 0));

        // Tell the item's script where it was dropped.
        itemScript.onDroppedByPlayer(cc.v2(dropPos.x, dropPos.y));

        // Update visual state locally
        this.heldItem.parent = this.node.parent;
        this.heldItem.setPosition(dropPos);
        this.heldItem.active = true;
        this.heldItem = null;

        if (this.dropItemSound) cc.audioEngine.playEffect(this.dropItemSound, false);
        if (this.smokeEffectPrefab) {
            const smoke = cc.instantiate(this.smokeEffectPrefab);
            smoke.setPosition(dropPos);
            this.node.parent.addChild(smoke);
            this.scheduleOnce(() => { smoke.destroy(); }, 1.5);
        }
    }

    // --- [The rest of the methods below are from your original file and are unchanged] ---

    private applyCharacterFromSelection() {
        this.selectedCharacter = cc.sys.localStorage.getItem("selectedCharacter") || "mario";
        const index = characterMap[this.selectedCharacter] ?? 0;
        const sprite = this.getComponent(cc.Sprite);
        const anim = this.getComponent(cc.Animation);

        if (this.characterSprites[index]) {
            sprite.spriteFrame = this.characterSprites[index];
        }

        if (anim) {
            anim.addClip(this.characterDefaultClips[index], "Default");
            anim.addClip(this.characterMoveClips[index], "Move");
            anim.addClip(this.characterJumpClips[index], "Jump");
            anim.defaultClip = this.characterDefaultClips[index];
            anim.play("Default");
        }
    }

    retrievePlayerIdAndName() {
        const storedPlayerId = cc.sys.localStorage.getItem('playerId');
        const storedPlayerName = cc.sys.localStorage.getItem('playerName');

        if (storedPlayerId) {
            this.playerId = storedPlayerId;
        } else {
            this.playerId = `player_${Date.now()}_${Math.floor(Math.random() * 10000)}`;
            cc.sys.localStorage.setItem('playerId', this.playerId);
        }

        if (storedPlayerName && storedPlayerName.trim() !== "") {
            this.playerName = storedPlayerName;
        } else {
            if (!storedPlayerId && this.playerName && this.playerName.trim() !== "") {
                 cc.sys.localStorage.setItem('playerName', this.playerName);
            }
        }
    }

    setupOnDisconnect() {
        if (typeof firebase === 'undefined' || !firebase.database) {
            cc.error("[Player] Firebase Database is not available for onDisconnect setup.");
            return;
        }
        const playerRef = firebase.database().ref(`players/${this.playerId}`);
        playerRef.onDisconnect().update({
            online: false,
            lastUpdate: firebase.database.ServerValue.TIMESTAMP
        })
        .catch(err => cc.error(`[Player] Error setting onDisconnect for ${this.playerId}:`, err));
    }

    private spawnWalkSmoke() {
        if (!this.walkSmokePrefab) return;
        const smoke = cc.instantiate(this.walkSmokePrefab);
        const smokePos = this.node.position.add(cc.v3(0, -10, 0));
        smoke.setPosition(smokePos);
        this.node.parent.addChild(smoke);
        this.scheduleOnce(() => smoke.destroy(), 0.4); 
    }

    private sendCurrentStateToFirebase(isInitial: boolean = false) {
        if (!this.playerId || !this.multiplayerManager) return;
        
        const state: PlayerState = {
            name: this.playerName,
            x: Math.round(this.node.x),
            y: Math.round(this.node.y),
            animation: this.anim?.currentClip?.name || "Default",
            facing: this.node.scaleX > 0 ? 1 : -1,
            online: true,
            lastUpdate: firebase.database.ServerValue.TIMESTAMP,
            character: this.selectedCharacter
        };
        this.multiplayerManager.sendPlayerState(this.playerId, state);
    }

    private createNameLabel() {
        if (this.node.getChildByName("PlayerNameLabel")) return;
        const lblNode = new cc.Node("PlayerNameLabel");
        this.node.addChild(lblNode);
        this.playerNameLabel = lblNode.addComponent(cc.Label);
        this.playerNameLabel.string = this.playerName;
        this.playerNameLabel.fontSize = 15;
        this.playerNameLabel.node.color = cc.Color.WHITE;
    }

    private updateNamePosition() {
        if (!this.playerNameLabel) return;
        const playerSprite = this.getComponent(cc.Sprite);
        const playerHeight = playerSprite ? playerSprite.node.height * Math.abs(this.node.scaleY) : 64;
        this.playerNameLabel.node.position = cc.v3(0, playerHeight / 2 + 10, 0);
        const sX = this.node.scaleX;
        this.playerNameLabel.node.scaleX = Math.abs(this.playerNameLabel.node.scaleX) * (sX === 0 ? 1 : Math.sign(sX));
    }

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

    private updateCamera() {
         if (this.cameraNode) {
            this.cameraNode.x = this.node.x;
            this.cameraNode.y = this.node.y;
        }
    }

    private updateAnim() {
        const next = this.isDead ? "Die"
                    : this.isJumping ? "Jump"
                    : this.dir.x !== 0 ? "Move"
                    : "Default";
        if (next === this.currentAnim) return;
        const state = this.anim?.getAnimationState(next);
        if (!state) return;
        this.anim.play(next);
        this.currentAnim = next;
    }

    private highlight(n: cc.Node, on: boolean) {
        if (!n) return;
        n.color = on ? cc.Color.YELLOW : cc.Color.WHITE;
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

    public die() {
        if (this.isDead) return;
        this.isDead = true;
        this.dir.x = 0;
        if (this.rb) {
            this.rb.linearVelocity = cc.Vec2.ZERO;
            this.rb.enabled = false;
        }
        if (this.deathSound) {
            cc.audioEngine.playEffect(this.deathSound, false);
        }
        this.scheduleOnce(() => {
            this.respawn();
        }, 2);
    }

    public respawn() {
        this.node.setPosition(this.respawnPoint.x, this.respawnPoint.y);
        if (this.rb) {
            this.rb.enabled = true;
            this.rb.linearVelocity = cc.v2(0, 0);
            this.rb.angularVelocity = 0;
        }
        this.isDead = false;
        this.isJumping = false;
        this.isOnGround = true;
        this.sendCurrentStateToFirebase(true);
        cc.systemEvent.emit("PLAYER_RESPAWNED");
    }
}