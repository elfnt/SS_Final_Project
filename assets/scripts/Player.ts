import { FirebaseManager } from "./FirebaseManager";

const { ccclass, property } = cc._decorator;

@ccclass
export default class Player extends cc.Component {
    @property moveSpeed = 200;
    @property jumpHeight = 150;
    @property({ type: cc.Node }) cameraNode: cc.Node = null;
    @property({ type: cc.AudioClip }) jumpSound: cc.AudioClip = null;
    @property({ type: cc.AudioClip }) deathSound: cc.AudioClip = null;
    @property itemDetectRadius = 100;
    @property playerName: string = "Player";
    @property updatePositionInterval: number = 3;

    private anim: cc.Animation = null;
    private rb: cc.RigidBody = null;
    private dir = cc.v2(0, 0);
    private isOnGround = false;
    private isJumping = false;
    private isDead = false;
    private playerNameLabel: cc.Label = null;
    private playerId: string = "";
    private lastPositionUpdate: number = 0;
    private physicsGravityY: number = 0;

    private heldItem: cc.Node = null;
    private nearestItem: cc.Node = null;
    private originalWorldScale: cc.Vec2 = null;
    private originalItemFixedRotation: boolean = null;
    private originalItemFriction: number = null;
    private lastFacing: number = 1;

    onLoad() {
        this.anim = this.getComponent(cc.Animation);
        this.rb = this.getComponent(cc.RigidBody);
        cc.director.getPhysicsManager().enabled = true;
        if (this.rb) this.rb.fixedRotation = true;
        this.physicsGravityY = Math.abs(cc.director.getPhysicsManager().gravity.y);
        this.addKeyListeners();
        this.retrievePlayerInfo();
        this.createNameLabel();
        cc.log("[Player] Using name:", this.playerName);
    }
    
    retrievePlayerInfo() {
        if (typeof window !== 'undefined' && window['playerName']) {
            this.playerName = window['playerName']; this.playerId = window['playerId'] || "";
            cc.log("[Player] Retrieved name from window:", this.playerName);
        } else if (cc.sys.localStorage.getItem('playerName')) {
            this.playerName = cc.sys.localStorage.getItem('playerName'); this.playerId = cc.sys.localStorage.getItem('playerId') || "";
            cc.log("[Player] Retrieved name from localStorage:", this.playerName);
        } else {
            cc.log("[Player] No stored name found, using default:", this.playerName);
        }
    }
    
    onDestroy() { this.removeKeyListeners(); }
    
    update(dt: number) {
        if (this.isDead) return;
        this.moveHorizontal(); this.updateCamera(); this.updateAnim(); this.detectNearestItem();
        this.node.angle = 0; if (this.rb) this.rb.angularVelocity = 0;
        this.updateNamePosition(); this.updatePositionToDatabase(dt);
    }
    
    private updatePositionToDatabase(dt: number) {
        if (!this.playerId || (this.lastPositionUpdate += dt) < this.updatePositionInterval) return;
        this.lastPositionUpdate = 0;
        FirebaseManager.getInstance().savePlayerData(this.playerId, {
            name: this.playerName, position: { x: this.node.x, y: this.node.y }, lastUpdated: Date.now()
        }).then(() => cc.log("[Player] Position updated")).catch(e => cc.error("[Player] Error pos update:", e));
    }
    
    private createNameLabel() {
        const lblNode = new cc.Node("PlayerNameLabel"); this.node.addChild(lblNode);
        this.playerNameLabel = lblNode.addComponent(cc.Label);
        this.playerNameLabel.string = this.playerName; this.playerNameLabel.fontSize = 15;
        this.playerNameLabel.node.color = cc.Color.WHITE; this.updateNamePosition();
    }
    
    private updateNamePosition() {
        if (!this.playerNameLabel) return;
        this.playerNameLabel.node.position = cc.v3(0, this.node.height + 20, 0);
        const sX = this.node.scaleX; this.playerNameLabel.node.scaleX = Math.abs(this.playerNameLabel.node.scaleX) * (sX === 0 ? 1 : Math.sign(sX));
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
    
    private onKeyDown(e: cc.Event.EventKeyboard) {
        if (this.isDead) return;
        const absScaleX = Math.abs(this.node.scaleX) || 1; // Default to 1 if current scale is 0
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
        if (this.cameraNode) this.cameraNode.setPosition(this.node.x - cc.winSize.width / 2, this.node.y - cc.winSize.height / 2);
    }
    
    private updateAnim() {
        const animName = this.isDead ? "Die" : this.isJumping ? "Jump" : this.dir.x !== 0 ? "Move" : "Default";
        if (this.anim && (!this.anim.currentClip || this.anim.currentClip.name !== animName)) this.anim.play(animName);
    }
    
    onBeginContact(contact: cc.PhysicsContact, selfCol: cc.PhysicsCollider, otherCol: cc.PhysicsCollider) {
        if (this.isDead) return;
        if (otherCol.node.group === "Ground" || otherCol.node.group === "Item") {
            const n = contact.getWorldManifold().normal; // Assuming normal points from selfCol to otherCol for this check
            if (n.y < -0.5 && contact.isTouching()) { // Player's feet hit something (normal from player to ground is downwards)
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
            if (item === this.heldItem) continue;
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
        if (n.group === 'Item') out.push(n); n.children.forEach(c => this.gatherItems(c, out));
    }
    
    private highlight(n: cc.Node, on: boolean) {
        n.color = on ? cc.Color.YELLOW : cc.Color.WHITE; n.opacity = on ? 230 : 255;
    }
    
    private pickUpItem(item: cc.Node) {
        this.heldItem = item; this.highlight(item, false);
        // Using the original simpler world scale calculation logic
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
        
        this.heldItem.parent = this.node.parent; // Assumes player and item share same parent when dropped
        this.heldItem.setPosition(dropPos.x, dropPos.y);
        
        // Using the original simpler setScale logic based on how originalWorldScale was stored
        if (this.originalWorldScale && this.heldItem.parent) {
             this.heldItem.setScale(
                 this.originalWorldScale.x / this.heldItem.parent.scaleX,
                 this.originalWorldScale.y / this.heldItem.parent.scaleY
             );
        } else if (this.originalWorldScale) { // No parent, assume parent scale is 1
            this.heldItem.setScale(this.originalWorldScale);
        }

        const rb = this.heldItem.getComponent(cc.RigidBody); const col = this.heldItem.getComponent(cc.PhysicsBoxCollider);
        if (rb && this.originalItemFixedRotation !== null) { rb.fixedRotation = this.originalItemFixedRotation; this.originalItemFixedRotation = null; }
        if (col && this.originalItemFriction !== null) { col.friction = this.originalItemFriction; col.apply(); this.originalItemFriction = null; }
        
        this.heldItem = null; this.nearestItem = null; this.originalWorldScale = null;
    }
}