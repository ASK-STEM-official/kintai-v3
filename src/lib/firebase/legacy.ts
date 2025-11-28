import { initializeApp, getApps } from 'firebase/app';
import { getFirestore, collection, query, where, getDocs } from 'firebase/firestore';

const firebaseConfig = {
  apiKey: "AIzaSyABg6hFW2qK70K_RM53_rPV0DsYjRei9C0",
  authDomain: "stem-kintaikanri.firebaseapp.com",
  projectId: "stem-kintaikanri",
  storageBucket: "stem-kintaikanri.firebasestorage.app",
  messagingSenderId: "305714579979",
  appId: "1:305714579979:web:5f9c279e7f5b927122550e",
  measurementId: "G-XTYTDN20SB"
};

// Initialize Firebase (only if not already initialized)
const legacyApp = getApps().find(app => app.name === 'legacy') || initializeApp(firebaseConfig, 'legacy');
const legacyDb = getFirestore(legacyApp);

export interface LegacyUserData {
  cardId: string;
  firstname: string;
  lastname: string;
  github: string;
  grade: number;
  teamId: string;
  uid: string;
}

export async function searchLegacyUserByName(firstname: string, lastname: string): Promise<LegacyUserData | null> {
  try {
    const usersRef = collection(legacyDb, 'users');
    
    // Search by firstname and lastname
    const q = query(
      usersRef,
      where('firstname', '==', firstname.toLowerCase()),
      where('lastname', '==', lastname.toLowerCase())
    );
    
    const querySnapshot = await getDocs(q);
    
    if (querySnapshot.empty) {
      return null;
    }
    
    // Get the first matching user
    const doc = querySnapshot.docs[0];
    const data = doc.data();
    
    return {
      cardId: data.cardId || '',
      firstname: data.firstname || '',
      lastname: data.lastname || '',
      github: data.github || '',
      grade: data.grade || 0,
      teamId: data.teamId || '',
      uid: data.uid || ''
    };
  } catch (error) {
    console.error('Error searching legacy user:', error);
    return null;
  }
}

export async function searchLegacyUsersByPartialName(searchTerm: string): Promise<LegacyUserData[]> {
  try {
    const usersRef = collection(legacyDb, 'users');
    
    // Firestoreは部分検索をサポートしていないので、全件取得してフィルタリング
    const querySnapshot = await getDocs(usersRef);
    
    const results: LegacyUserData[] = [];
    const searchLower = searchTerm.toLowerCase().trim();
    const searchNoSpace = searchLower.replace(/\s+/g, ''); // スペースを削除
    
    querySnapshot.forEach((doc) => {
      const data = doc.data();
      const firstname = (data.firstname || '').toLowerCase();
      const lastname = (data.lastname || '').toLowerCase();
      const fullname = `${lastname} ${firstname}`;
      const reverseName = `${firstname} ${lastname}`;
      const fullnameNoSpace = `${lastname}${firstname}`; // スペースなし
      const reverseNameNoSpace = `${firstname}${lastname}`; // スペースなし
      
      // 部分一致検索（スペースあり・なし両方対応）
      if (firstname.includes(searchLower) || 
          lastname.includes(searchLower) || 
          fullname.includes(searchLower) ||
          reverseName.includes(searchLower) ||
          fullnameNoSpace.includes(searchNoSpace) ||
          reverseNameNoSpace.includes(searchNoSpace) ||
          firstname.includes(searchNoSpace) ||
          lastname.includes(searchNoSpace)) {
        results.push({
          cardId: data.cardId || '',
          firstname: data.firstname || '',
          lastname: data.lastname || '',
          github: data.github || '',
          grade: data.grade || 0,
          teamId: data.teamId || '',
          uid: data.uid || ''
        });
      }
    });
    
    return results;
  } catch (error) {
    console.error('Error searching legacy users:', error);
    return [];
  }
}

