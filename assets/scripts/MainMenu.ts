const { ccclass, property } = cc._decorator;

@ccclass
export default class MainMenu extends cc.Component {
    @property(cc.Node)
    startButton: cc.Node = null;

    onLoad () {
        this.startButton.on('click', this.onStartGame, this);
    }

    onStartGame () {
        cc.director.loadScene('GameScene');
    }
}
