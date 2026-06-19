// Firebase SDK (Firestore + Auth)
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getFirestore, collection, addDoc, deleteDoc, doc, onSnapshot } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";
import { 
    getAuth, 
    createUserWithEmailAndPassword, 
    signInWithEmailAndPassword, 
    onAuthStateChanged,
    GoogleAuthProvider,
    signInWithPopup,
    sendEmailVerification
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";

// Firebase Config
const firebaseConfig = {
  apiKey: "AIzaSyD3lL8FGKLG6ox278q3FEc2QUrzayA-ogw",
  authDomain: "to-do-list-37201.firebaseapp.com",
  projectId: "to-do-list-37201",
  storageBucket: "to-do-list-37201.firebasestorage.app",
  messagingSenderId: "558529326511",
  appId: "1:558529326511:web:f562daf7c8bd7b0044535a",
  measurementId: "G-N31YZ2699T"
};

// Firestore and Firebase Authentication
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);

// link html elements to javascript
const todoInput = document.getElementById("todo-input");
const addBtn = document.getElementById("add-btn");
const todoList = document.getElementById("todo-list");

// login/signup form elements
const authContainer = document.getElementById('auth-container');
const todoContainer = document.getElementById('todo-container');
const authForm = document.getElementById('auth-form');
const authEmail = document.getElementById('auth-email');
const authPassword = document.getElementById('auth-password');
const authSubmitBtn = document.getElementById('auth-submit-btn');
const authTitle = document.getElementById('auth-title');
const toggleAuthMode = document.getElementById('toggle-auth-mode');
const googleBtn = document.getElementById('google-btn');
const provider = new GoogleAuthProvider();

let isLoginMode = true; 

// toggle login/signup mode
toggleAuthMode.addEventListener('click', () => {
    isLoginMode = !isLoginMode;
    if (!isLoginMode) {
        authTitle.innerText = "إنشاء حساب جديد";
        authSubmitBtn.innerText = "تسجيل الحساب";
        toggleAuthMode.innerText = "تسجيل الدخول بدلاً من ذلك";
    } else {
        authTitle.innerText = "تسجيل الدخول";
        authSubmitBtn.innerText = "دخول";
        toggleAuthMode.innerText = "إنشاء حساب جديد";
    }
});

// sign in/up with email and password
authForm.addEventListener('submit', (e) => {
    e.preventDefault();
    
    const email = authEmail.value;
    const password = authPassword.value;

    if (isLoginMode) {
        // sign in with email and password
        signInWithEmailAndPassword(auth, email, password)
            .then(() => {
                alert("تم تسجيل الدخول بنجاح! 🎉");
            })
            .catch((error) => {
                alert("خطأ في الدخول: " + error.message);
            });
    } else {
        // create new account
        createUserWithEmailAndPassword(auth, email, password)
            .then((userCredential) => {
                // get user object
                const user = userCredential.user;
                
                // send email verification
                sendEmailVerification(user)
                    .then(() => {
                        alert("تم إنشاء الحساب بنجاح! 🎉 وتبعتلك رسالة تأكيد على إيميلك، يرجى تفعيل الحساب.");
                    });
            })
            .catch((error) => {
                alert("خطأ في الإنشاء: " + error.message);
            });
    }
});

// switch login mode and user mode
onAuthStateChanged(auth, (user) => {
    if (user) {
        if (user.emailVerified || user.providerData[0].providerId === 'google.com') {
            // show todo list and hide login form
            authContainer.classList.add('hidden');
            todoContainer.classList.remove('hidden');
            console.log("المستخدم الحالي ومفعل:", user.uid);
        } else {
            // account not verified
            alert("يرجى تفعيل حسابك من خلال الرابط المرسل إلى بريدك الإلكتروني أولاً! 📧");
            
            // hide todo list and show login form
            authContainer.classList.remove('hidden');
            todoContainer.classList.add('hidden');
            
            // sign out
            auth.signOut(); 
        }
    } else {
        // show login form and hide todo list
        authContainer.classList.remove('hidden');
        todoContainer.classList.add('hidden');
    }
});

// add new task to firebase
addBtn.addEventListener("click", async () => {
    const taskText = todoInput.value.trim();
    
    if (taskText === "") {
        alert("ايه المهمه الفاضيه دي 😆");
        return;
    }

    try {
        await addDoc(collection(db, "todos"), {
            text: taskText,
            createdAt: new Date()
        });
        
        todoInput.value = ""; 
    } catch (error) {
        console.error("خطا اثناء إضافة المهمه: ", error);
    }
});

// read data from firebase and display it in the browser
onSnapshot(collection(db, "todos"), (snapshot) => {
    todoList.innerHTML = ""; 
    
    snapshot.forEach((documentSnapshot) => {
        const task = documentSnapshot.data();
        const taskId = documentSnapshot.id; 

        const li = document.createElement("li");
        li.innerHTML = `
            <span>${task.text}</span>
            <button class="delete-btn" data-id="${taskId}">مسح</button>
        `;
        
        todoList.appendChild(li);
    });

    setupDeleteButtons();
});

// delete task from firebase
function setupDeleteButtons() {
    const deleteButtons = document.querySelectorAll(".delete-btn");
    deleteButtons.forEach(btn => {
        btn.addEventListener("click", async (e) => {
            const id = e.target.getAttribute("data-id");
            await deleteDoc(doc(db, "todos", id));
        });
    });
}

// sign in with google
googleBtn.addEventListener('click', () => {
    signInWithPopup(auth, provider)
        .then((result) => {
            alert("تم تسجيل الدخول بحساب جوجل بنجاح! 🚀");
        })
        .catch((error) => {
            alert("حصل خطأ أثناء الدخول بجوجل: " + error.message);
        });
});