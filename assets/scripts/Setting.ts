const { ccclass, property } = cc._decorator;

@ccclass
export default class MainMenu extends cc.Component {
    @property(cc.Node)
    mainMenuButton: cc.Node = null;

    onLoad () {
        this.mainMenuButton.on('click', this.onMainMenu, this);
    }

    onMainMenu () {
        cc.director.loadScene('MainMenu');
    }
}
