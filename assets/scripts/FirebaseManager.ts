// Learn TypeScript:
//  - https://docs.cocos.com/creator/manual/en/scripting/typescript.html
// Learn Attribute:
//  - https://docs.cocos.com/creator/manual/en/scripting/reference/attributes.html
// Learn life-cycle callbacks:
//  - https://docs.cocos.com/creator/manual/en/scripting/life-cycle-callbacks.html

// FirebaseManager.ts

// FirebaseManager.ts

declare const firebase: any; // For compatibility with Firebase

export class FirebaseManager {
  private static instance: FirebaseManager;
  public database: any;

  private constructor() {
    const firebaseConfig = {
      apiKey: "AIzaSyAijSWSyEjHUC95bhCwAGIyKZFIDC69xRQ",
      authDomain: "ssfp-8139e.firebaseapp.com",
      databaseURL: "https://ssfp-8139e-default-rtdb.firebaseio.com",
      projectId: "ssfp-8139e",
      storageBucket: "ssfp-8139e.firebasestorage.app",
      messagingSenderId: "647323954046",
      appId: "1:647323954046:web:7058021c9a4cbd782da12f",
      measurementId: "G-XVETSBJZRP"
    };

    // Initialize Firebase
    if (!firebase.apps.length) {
      firebase.initializeApp(firebaseConfig);
      console.log("Firebase initialized successfully.");
    } else {
      console.log("Firebase already initialized.");
    }

    // Initialize Realtime Database
    this.database = firebase.database();
  }

  // Singleton pattern to ensure only one instance of FirebaseManager
  public static getInstance(): FirebaseManager {
    if (!this.instance) {
      this.instance = new FirebaseManager();
    }
    return this.instance;
  }

  // Save player data to the database
  public async savePlayerData(playerId: string, data: any): Promise<void> {
    try {
      await this.database.ref(`players/${playerId}`).set(data);
      console.log(`Player data saved for ${playerId}:`, data);
    } catch (error) {
      console.error("Error saving player data:", error);
    }
  }

  // Fetch player data from the database
  public async fetchPlayerData(playerId: string): Promise<any> {
    try {
      const snapshot = await this.database.ref(`players/${playerId}`).once("value");
      if (snapshot.exists()) {
        console.log(`Player data fetched for ${playerId}:`, snapshot.val());
        return snapshot.val();
      } else {
        console.log(`No data found for player ${playerId}.`);
        return null;
      }
    } catch (error) {
      console.error("Error fetching player data:", error);
    }
  }

  // Listen for changes to a player's data
  public listenToPlayerData(playerId: string, callback: (data: any) => void): void {
    this.database.ref(`players/${playerId}`).on("value", (snapshot) => {
      if (snapshot.exists()) {
        console.log(`Player data updated for ${playerId}:`, snapshot.val());
        callback(snapshot.val());
      } else {
        console.log(`No data found for player ${playerId}.`);
      }
    });
  }

  // Remove a player from the database
  public async removePlayer(playerId: string): Promise<void> {
    try {
      await this.database.ref(`players/${playerId}`).remove();
      console.log(`Player ${playerId} removed from the database.`);
    } catch (error) {
      console.error("Error removing player:", error);
    }
  }

  // Sync game state in real-time
  public syncGameState(gameId: string, callback: (state: any) => void): void {
    this.database.ref(`games/${gameId}`).on("value", (snapshot) => {
      if (snapshot.exists()) {
        console.log(`Game state updated for ${gameId}:`, snapshot.val());
        callback(snapshot.val());
      } else {
        console.log(`No game state found for ${gameId}.`);
      }
    });
  }

  // Update game state
  public async updateGameState(gameId: string, state: any): Promise<void> {
    try {
      await this.database.ref(`games/${gameId}`).set(state);
      console.log(`Game state updated for ${gameId}:`, state);
    } catch (error) {
      console.error("Error updating game state:", error);
    }
  }
}