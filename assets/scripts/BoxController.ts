// BoxController.ts (Refactored for Smooth Sync)
import FirebaseManager from "./FirebaseManager";

const { ccclass, property } = cc._decorator;

// NEW: Helper functions for smooth interpolation
function lerp(a: number, b: number, t: number): number {
    return a + (b - a) * t;
}
function lerpAngle(a: number, b: number, t: number): number {
    let diff = b - a;
    while (diff > 180) diff -= 360;
    while (diff < -180) diff += 360;
    return a + diff * t;
}

@ccclass
export default class BoxLogicController extends cc.Component {
    @property({ tooltip: "Firebase �W�� box ID" })
    boxId: string = "box1";

    @property({ tooltip: "�O�_�ҥΦ۰ʭ��͡]y < ���e�^" })
    enableAutoRespawn: boolean = true;

    @property({ tooltip: "y < ? �N�|Ĳ�o����" })
    fallThreshold: number = -1200;

    @property({ tooltip: "���ͫᰱ�δX��]����ܡ^" })
    respawnLockSeconds: number = 0.5;

    @property({ tooltip: "���͹w�]����" })
    angleISet: number = 0;

    @property({ type: cc.Label, tooltip: "��ܳѾl�H�ƪ� Label" })
    labelNode: cc.Label = null;

    // --- NEW: Properties for smooth interpolation ---
    @property({ tooltip: "���ȳt�סA�V�j�V�ָ�W�A��ĳ 5-15" })
    lerpSpeed: number = 10;
    
    private targetPosition: cc.Vec2 = null;
    private targetRotation: number = 0;
    // ---

    private rb: cc.RigidBody = null;
    private initialPosition: cc.Vec2 = null;

    private isRespawning: boolean = false;
    private isControlling: boolean = false;
    private controllerId: string = null;
    private touchingPlayerIds: Set<string> = new Set();

    private lastSentPos: cc.Vec2 = null;
    private lastSentRot: number = null;

    onLoad() {
        this.rb = this.getComponent(cc.RigidBody);
        this.initialPosition = this.node.getPosition().clone();
        this.targetPosition = this.initialPosition.clone();
        this.targetRotation = this.node.angle;

        const firebase = FirebaseManager.getInstance();
        const localId = cc.sys.localStorage.getItem("playerId");
        const ref = firebase.database.ref(`boxes/${this.boxId}`);

        // ? ��l�� Firebase ���A
        ref.update({
            isRespawn: true,
            controllerId: localId,
            position: {
                x: Math.round(this.initialPosition.x),
                y: Math.round(this.initialPosition.y),
                rotation: Math.round(this.node.angle)
            },
            boxTriggered: false,
            status: 0
        }).then(() => {
            cc.log(`[BoxLogic] ? �}����l�� isRespawn = true�A�üg�J��l��m`);

            // ? ��s node ����m
            this.node.setPosition(this.initialPosition);
            this.node.angle = this.angleISet;

            // ? �Ұ� Firebase ��ť
            this.listenToFirebase();

            // ? �Ұʦ�m�W�ǱƵ{
            this.schedule(() => {
                if (!this.isRespawning && this.isControlling) {
                    this.tryUploadPosition();
                }
            }, 0.05);

            // ? ����M�����ͪ��A
            setTimeout(() => {
                ref.update({ isRespawn: false });
                this.isRespawning = false;
                cc.log(`[BoxLogic] ? isRespawn = false`);
            }, this.respawnLockSeconds * 1000);
        });

        cc.systemEvent.on("PLAYER_RESPAWNED", this.onPlayerRespawned, this);
    }

    onDestroy() {
        cc.systemEvent.off("PLAYER_RESPAWNED", this.onPlayerRespawned, this);
    }

    private onPlayerRespawned() {
        cc.log(`[BoxLogic] ? ���a���ͨƥ�Ĳ�o �� �٭� Box ��m`);
        this.doRespawn();
    }

    start() {
        this.schedule(() => {
            if (!this.isRespawning && this.isControlling) {
                this.tryUploadPosition();
            }
        }, 0.05);
    }

    update(dt: number) {
        // --- CHANGED: Update loop now handles both controller and remote logic ---
        if (this.isControlling) {
            // Controller logic: Check for falling
            if (this.enableAutoRespawn && !this.isRespawning && this.node.y < this.fallThreshold) {
                this.doRespawn();
            }
        } else {
            // Remote logic: Smoothly interpolate towards the target
            if (this.targetPosition) {
                const currentPos = this.node.getPosition();
                const newPos = currentPos.lerp(this.targetPosition, dt * this.lerpSpeed);
                this.node.setPosition(newPos);
            }
            if (typeof this.targetRotation === 'number') {
                this.node.angle = lerpAngle(this.node.angle, this.targetRotation, dt * this.lerpSpeed);
            }
        }
    }
    
    onBeginContact(contact, self, other) {
        const comp = other.node.getComponent("Player") || other.node.getComponent("Other-Player");
        const id = comp?.playerId;
        if (id) {
            this.touchingPlayerIds.add(id);
            this.tryTakeControl(id);
            this.updateRemainingStatus();
        }
    }

    onEndContact(contact, self, other) {
        const comp = other.node.getComponent("Player") || other.node.getComponent("Other-Player");
        const id = comp?.playerId;
        if (id) {
            this.touchingPlayerIds.delete(id);
            this.updateRemainingStatus();
        }
    }

    private tryTakeControl(id: string) {
        const localId = cc.sys.localStorage.getItem("playerId");
        const firebase = FirebaseManager.getInstance();

        firebase.database.ref(`boxes/${this.boxId}/controllerId`).once("value", snapshot => {
            const current = snapshot.val();

            const controllerStillTouching = current && this.touchingPlayerIds.has(current);
            const isNewToucher = this.touchingPlayerIds.has(id);

            if (!controllerStillTouching && isNewToucher) {
                if (id === localId) {
                    // We don't set isControlling here, we let the listener do it
                    // to maintain a single source of truth.
                    firebase.database.ref(`boxes/${this.boxId}`).update({
                        controllerId: id
                    });
                    cc.log(`[BoxLogic] ? ${id} �����s������̡]�챱��̤w���}�^`);
                }
            } else {
                cc.log(`[BoxLogic] ${id} ���ձ��ަ� ${current} ��������̩α��󤣲�`);
            }
        });
    }

    private tryUploadPosition() {
        const pos = this.node.getPosition();
        const angle = this.node.angle;

        const xChanged = !this.lastSentPos || Math.abs(pos.x - this.lastSentPos.x) > 0.5;
        const yChanged = !this.lastSentPos || Math.abs(pos.y - this.lastSentPos.y) > 0.5;
        const rotChanged = this.lastSentRot === null || Math.abs(angle - this.lastSentRot) > 1;

        cc.log(`[BoxLogic] ? ���դW�� position�AxChanged=${xChanged}, yChanged=${yChanged}, rotChanged=${rotChanged}`);

        if (xChanged || yChanged || rotChanged) {
            this.lastSentPos = pos.clone();
            this.lastSentRot = angle;

            const firebase = FirebaseManager.getInstance();
            firebase.database.ref(`boxes/${this.boxId}/position`).set({
                x: Math.round(pos.x),
                y: Math.round(pos.y),
                rotation: Math.round(angle)
            }).then(() => {
                cc.log(`[BoxLogic] ? ���\�W�Ǧ�m�G(${pos.x}, ${pos.y}, rot=${angle})`);
            }).catch((err) => {
                cc.error(`[BoxLogic] ? �W�� Firebase ���ѡG`, err);
            });
        }
    }

    private listenToFirebase() {
        const firebase = FirebaseManager.getInstance();
        const localId = cc.sys.localStorage.getItem("playerId");
        const boxRef = firebase.database.ref(`boxes/${this.boxId}`);

        boxRef.on("value", (snapshot) => {
            const data = snapshot.val();
            if (!data) return;

            const remoteController = data.controllerId;
            this.controllerId = remoteController;
            this.isControlling = (remoteController === localId);

            cc.log(`[BoxLogic] ? localId=${localId}, controllerId=${remoteController}, isControlling=${this.isControlling}`);

            this.isRespawning = !!data.isRespawn;

            const pos = data.position;
            if (!this.isControlling && pos) {
                // If we are NOT the controller, we don't snap to the position.
                // We update our TARGET position and let the `update` loop handle the rest.
                this.targetPosition = cc.v2(pos.x, pos.y);
                if (typeof pos.rotation === 'number') {
                    this.targetRotation = pos.rotation;
                }
                this.scheduleOnce(() => {
                    if (this.rb && !this.rb.enabled) {
                        this.rb.enabled = true;
                        this.rb.awake = true;
                    }
                }, 0.01);
                cc.log(`[BoxLogic] ?? �D����̦P�B��m�� ${pos.x}, ${pos.y}, rot=${pos.rotation}`);
            }
        });
    }

    private doRespawn() {
        this.isRespawning = true;
        const firebase = FirebaseManager.getInstance();
        const ref = firebase.database.ref(`boxes/${this.boxId}`);

        // This client (the controller) updates its own position locally first.
        this.node.setPosition(this.initialPosition);
        this.node.angle = this.angleISet;
        if (this.rb) {
            this.rb.linearVelocity = cc.Vec2.ZERO;
            this.rb.angularVelocity = 0;
        }

        // Then it tells Firebase about the respawn, which updates all clients.
        ref.update({
            isRespawn: true,
            position: {
                x: Math.round(this.initialPosition.x),
                y: Math.round(this.initialPosition.y),
                rotation: Math.round(this.angleISet)
            }
        }).then(() => {
            cc.log(`[BoxLogic] isRespawn = true`);
            setTimeout(() => {
                ref.update({ isRespawn: false });
                this.isRespawning = false; // This will also be set by the listener
                cc.log(`[BoxLogic] isRespawn = false`);
            }, this.respawnLockSeconds * 1000);
        });
    }

    private updateRemainingStatus() {
        let remaining: number;
        if (this.boxId === "box2") {
            remaining = Math.max(0, 1 - this.touchingPlayerIds.size);
        } else {
            remaining = Math.max(0, 3 - this.touchingPlayerIds.size);
        }

        if (this.labelNode) {
            this.labelNode.string = remaining.toString();
        }

        const firebase = FirebaseManager.getInstance();
        firebase.database.ref(`boxes/${this.boxId}`).update({
            status: remaining
        });
    }
}