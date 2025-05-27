const { ccclass, property } = cc._decorator;

@ccclass
export default class ButtonImageSwitcher extends cc.Component {

    @property(cc.Button)
    targetButton: cc.Button = null;

    @property(cc.Sprite)
    sideImage: cc.Sprite = null;

    @property(cc.SpriteFrame)
    normalImage: cc.SpriteFrame = null;  // 預設圖片（沒 hover 時）

    @property(cc.SpriteFrame)
    hoverImage: cc.SpriteFrame = null;   // Hover 時顯示的圖片

    onLoad() {
        const btnNode = this.targetButton.node;

        // 滑鼠移進來：顯示 Hover 圖片
        btnNode.on(cc.Node.EventType.MOUSE_ENTER, this.onHoverIn, this);

        // 滑鼠移出去：恢復預設圖片
        btnNode.on(cc.Node.EventType.MOUSE_LEAVE, this.onHoverOut, this);
    }

onHoverIn() {
    if (this.sideImage && this.hoverImage) {
        this.sideImage.spriteFrame = this.hoverImage;

        // 為了補償圖片較小的尺寸，放大一點
        this.sideImage.node.setScale(0.2); // 根據實際視覺感微調
    }
}

onHoverOut() {
    if (this.sideImage && this.normalImage) {
        this.sideImage.spriteFrame = this.normalImage;

        // 回到原本大小（完好蛋圖用 scale 1.0）
        this.sideImage.node.setScale(0.15);
    }
}

}
