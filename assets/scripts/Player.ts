const { ccclass, property } = cc._decorator;

@ccclass
export default class Player extends cc.Component {
/* ��������������������������������� Inspector ��������������������������������� */
@property moveSpeed = 200;
@property jumpHeight = 150;
@property({ type: cc.Node }) cameraNode: cc.Node = null;
@property({ type: cc.AudioClip }) jumpSound: cc.AudioClip = null;
@property({ type: cc.AudioClip }) deathSound: cc.AudioClip = null;
/** ��剝��蝛箇��暺�嚗���湔�臭葉�����脖��嚗� */
@property({ type: cc.Node }) itemContainer: cc.Node = null;
/** ���撠����餈������瑕��敺� */
@property itemDetectRadius = 100;
/** Whether this player can be controlled with keyboard */
@property isLocalPlayer: boolean = true;

/* ��������������������������������� ��折�函����� ��������������������������������� */
private anim: cc.Animation = null;
private rb: cc.RigidBody = null;
private dir = cc.v2(0, 0);
private isOnGround = false;
private isJumping  = false;
private isDead     = false;

/* === Item === */
private heldItem: cc.Node = null;
private nearestItem: cc.Node = null;
private originalWorldScale: cc.Vec2 = null;
private originalItemFixedRotation: boolean = null;
private originalItemFriction: number = null;



/* ��������������������������������� Life-cycle ��������������������������������� */
onLoad() {
    this.anim = this.getComponent(cc.Animation);
    this.rb   = this.getComponent(cc.RigidBody);
    cc.director.getPhysicsManager().enabled = true;
    
    // Only add key listeners if this is the local player
    if (this.isLocalPlayer) {
        this.addKeyListeners();
    }
}

onDestroy() { 
    // Only remove key listeners if this is the local player
    if (this.isLocalPlayer) {
        this.removeKeyListeners(); 
    }
}

/* ��������������������������������� Input ��������������������������������� */
private addKeyListeners() {
    cc.systemEvent.on(cc.SystemEvent.EventType.KEY_DOWN, this.onKeyDown, this);
    cc.systemEvent.on(cc.SystemEvent.EventType.KEY_UP,   this.onKeyUp,   this);
}
private removeKeyListeners() {
    cc.systemEvent.off(cc.SystemEvent.EventType.KEY_DOWN, this.onKeyDown, this);
    cc.systemEvent.off(cc.SystemEvent.EventType.KEY_UP,   this.onKeyUp,   this);
}
private onKeyDown(e: cc.Event.EventKeyboard) {
    if (this.isDead) return;
    switch (e.keyCode) {
        case cc.macro.KEY.left:
            this.dir.x = -1;
            this.node.scaleX = -Math.abs(this.node.scaleX);
            break;
        case cc.macro.KEY.right:
            this.dir.x = 1;
            this.node.scaleX =  Math.abs(this.node.scaleX);
            break;
        case cc.macro.KEY.space:
            if (this.isOnGround) this.jump();
            break;
            case cc.macro.KEY.ctrl:
                if (this.heldItem) {
                    this.dropItem();
                } else if (this.nearestItem && this.dir.x === 0) {
                    this.pickUpItem(this.nearestItem);
                } else {
                    cc.log("[DEBUG] ��踹��憭望��嚗�隢����甇Ｘ�������輯絲������");
                }
                break;
    }
}
private onKeyUp(e: cc.Event.EventKeyboard) {
    if (this.isDead) return;
    if (e.keyCode === cc.macro.KEY.left  && this.dir.x === -1) this.dir.x = 0;
    if (e.keyCode === cc.macro.KEY.right && this.dir.x ===  1) this.dir.x = 0;
}

/* ��������������������������������� update ��������������������������������� */
update(dt: number) {
    if (this.isDead) return;

    this.moveHorizontal();
    this.updateCamera();
    this.updateAnim();
    this.detectNearestItem();

    /* 蝡���湛��蝳�甇Ｘ��頧� */
    this.node.angle = 0;
    if (this.rb) {
        this.rb.angularVelocity = 0;
        this.rb.fixedRotation   = true;
    }
}

/* ��������������������������������� 蝘餃�� / 頝唾�� ��������������������������������� */
private moveHorizontal() {
    if (!this.rb) return;
    const v = this.rb.linearVelocity;
    v.x = this.dir.x * this.moveSpeed;
    this.rb.linearVelocity = v;
}
private jump() {
    if (!this.rb) return;
    this.isOnGround = false;
    this.isJumping  = true;

    const g  = Math.abs(cc.director.getPhysicsManager().gravity.y);
    const vy = Math.sqrt(2 * g * this.jumpHeight);
    this.rb.linearVelocity = cc.v2(this.rb.linearVelocity.x, vy);

    if (this.jumpSound) cc.audioEngine.playEffect(this.jumpSound, false);
}

/* ��������������������������������� Ground Collision ��������������������������������� */
onBeginContact(contact, selfCol, otherCol) {
    if (this.isDead) return;
    if (otherCol.node.group === 'Ground' || otherCol.node.group === 'Item') {
        const n = contact.getWorldManifold().normal; // self ��� other
        if (n.y < -0.5) { this.isOnGround = true; this.isJumping = false; }
    }
}
onEndContact(contact, self, other) {
    if (other.node.group === 'Ground') this.isOnGround = false;
}

/* ��������������������������������� Camera ��������������������������������� */
private updateCamera() {
    if (!this.cameraNode) return;
    const w = cc.winSize;
    this.cameraNode.setPosition(this.node.x - w.width/2, this.node.y - w.height/2);
}

/* ��������������������������������� Animation ��������������������������������� */
private updateAnim() {
    let name = 'Default';
    if (this.isDead)            name = 'Die';
    else if (this.isJumping)    name = 'Jump';
    else if (this.dir.x !== 0)  name = 'Move';
    if (this.anim && (!this.anim.currentClip || this.anim.currentClip.name !== name))
        this.anim.play(name);
}

/* ��������������������������������� Item System ��������������������������������� */
private detectNearestItem() {
    const list: cc.Node[] = [];
    this.gatherItems(cc.director.getScene(), list);

    let near: cc.Node = null, min = this.itemDetectRadius;
    for (const it of list) {
        if (it === this.heldItem) continue;
        const d = this.node.position.sub(it.position).mag();
        if (d < min) { min = d; near = it; }
    }
    if (this.nearestItem && this.nearestItem !== near) this.highlight(this.nearestItem, false);
    this.nearestItem = near;
    if (this.nearestItem) this.highlight(this.nearestItem, true);
}
private gatherItems(n: cc.Node, out: cc.Node[]) {
    if (n.group === 'Item') out.push(n);
    n.children.forEach(c => this.gatherItems(c, out));
}
private highlight(n: cc.Node, on: boolean) {
    n.color   = on ? cc.color(255,255,0) : cc.Color.WHITE;
    n.opacity = on ? 230 : 255;
}

/* ---- ��輯絲 ---- */
private pickUpItem(item: cc.Node) {
    this.heldItem = item;
    this.highlight(item, false);

    /* 閮����銝����蝮格�橘��Vec2嚗� */
    const ws = cc.v2(item.scaleX * item.parent.scaleX,    // worldScaleX
                     item.scaleY * item.parent.scaleY);   // worldScaleY
    this.originalWorldScale = ws;

    /* �����函�拍�� */
    const rb = item.getComponent(cc.RigidBody);
    const col = item.getComponent(cc.PhysicsBoxCollider); // ��� Collider ��� friction ������������

    if (rb) {
        this.originalItemFixedRotation = rb.fixedRotation;
        rb.enabled = true;
        rb.type = cc.RigidBodyType.Dynamic;     // ��� 銝�敺�雿輻�� Dynamic
        rb.fixedRotation = true;
        rb.linearVelocity = cc.v2(0, 0);
        rb.angularVelocity = 0;
    }

    if (col) {
        this.originalItemFriction = col.friction;
        col.friction = 100;                     // ��� 頞�擃���拇�血��霈�摰�銝�皛����
        col.apply();                            // 敹���� apply ������蝡���喟�����
    }


    /* ��� container ��曉�券�凋��嚗�銝�鈭�擃�摨� */
    this.itemContainer.setPosition(0, this.node.height/2 + 20);

    /* �����唳����� container */
    item.parent = this.itemContainer;
    item.setPosition(0, 0);

    /* 蝞���啁�� localScale = worldScale / parentWorldScale */
    const pwsx = this.itemContainer.scaleX * this.itemContainer.parent.scaleX;
    const pwsy = this.itemContainer.scaleY * this.itemContainer.parent.scaleY;
    item.setScale(ws.x / pwsx, ws.y / pwsy);
}

/* ---- ��曆�� ---- */
private dropItem() {
    if (!this.heldItem) return;

    /* 銝���圈�Ｗ����孵�������� */
    const dx  = this.node.scaleX > 0 ? 30 : -30;
    const wpt = this.itemContainer.convertToWorldSpaceAR(cc.v2(dx, -10));
    const lpt = this.node.parent.convertToNodeSpaceAR(wpt);

    this.heldItem.parent = this.node.parent;
    this.heldItem.setPosition(lpt.x, lpt.y);

    /* ������ localScale ��� worldScale / ��郡arent worldScale */
    const pwsx = this.heldItem.parent.scaleX;
    const pwsy = this.heldItem.parent.scaleY;
    this.heldItem.setScale(this.originalWorldScale.x / pwsx,
                           this.originalWorldScale.y / pwsy);

    /* ��Ｗ儔��拍�� */
    const rb  = this.heldItem.getComponent(cc.RigidBody);
    const col = this.heldItem.getComponent(cc.PhysicsBoxCollider);
    if (rb) {
        rb.enabled = true;
        // rb.type = cc.RigidBodyType.Dynamic;
    
        // ��� �����������祉�� fixedRotation 閮剖��
        if (this.originalItemFixedRotation !== null) {
            rb.fixedRotation = this.originalItemFixedRotation;
            this.originalItemFixedRotation = null;
        }
    }
    if (col && this.originalItemFriction !== null) {
        col.friction = this.originalItemFriction;  // ��� �����������祉�� friction
        col.apply();
        this.originalItemFriction = null;
    }

    /* 皜���斤����� */
    this.heldItem            = null;
    this.nearestItem         = null;
    this.originalWorldScale  = null;
}
}