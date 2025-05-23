const { ccclass, property } = cc._decorator;

@ccclass
export default class Dropbox extends cc.Component {

    private hasTriggered: boolean = false;

    onBeginContact(contact, selfCollider, otherCollider) {
        // 確保只觸發一次
        
        if (this.hasTriggered) return;
        if (otherCollider.node.name === 'Player') {
            this.hasTriggered = true;
            cc.log("contact");
            this.scheduleOnce(() => {
                const rb = this.getComponent(cc.RigidBody);
                if (rb) {
                    rb.type = cc.RigidBodyType.Dynamic;  // 切換為會掉落
                    rb.awake = true; // 確保立即啟用物理效果
                }
            }, 0.5);
        }
    }
}
