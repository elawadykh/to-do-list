// Firebase SDK (Firestore + Auth)
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { initializeFirestore, persistentLocalCache, persistentMultipleTabManager, collection, addDoc, deleteDoc, doc, onSnapshot, query, where, updateDoc, getDocs, writeBatch } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";
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
const db = initializeFirestore(app, {
  localCache: persistentLocalCache({
    tabManager: persistentMultipleTabManager()
  })
});
const auth = getAuth(app);

// link html elements to javascript
const todoInput = document.getElementById("todo-input");
const addBtn = document.getElementById("add-btn");
const todoList = document.getElementById("todo-list");
const logoutBtn = document.getElementById("logout-btn");
const todoRecurring = document.getElementById("todo-recurring");

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
let unsubscribeTodos = null; // store the unsubscribe function for firestore listener
let allCachedTasks = []; // store all fetched tasks (both main and subtasks)
let mainTasks = []; // store main tasks only
let activeSubtaskFormId = null; // store the ID of the main task whose subtask input is open
let collapsedTaskIds = new Set(); // store IDs of tasks whose subtasks are collapsed

// Function to show toast notifications
function showToast(message, type = "info") {
    const container = document.getElementById("toast-container");
    if (!container) return;

    const toast = document.createElement("div");
    toast.className = `toast toast-${type}`;

    // Text container
    const textSpan = document.createElement("span");
    textSpan.innerText = message;
    toast.appendChild(textSpan);

    // Close button
    const closeBtn = document.createElement("button");
    closeBtn.className = "toast-close-btn";
    closeBtn.innerHTML = "&times;"; // "×" symbol
    closeBtn.addEventListener("click", () => {
        dismissToast(toast);
    });
    toast.appendChild(closeBtn);

    container.appendChild(toast);

    let isDismissed = false;
    function dismissToast(el) {
        if (isDismissed) return;
        isDismissed = true;
        el.classList.add("fade-out");
        
        // Remove from DOM after transition finishes (300ms)
        setTimeout(() => {
            el.remove();
        }, 300);
    }

    // Fade out and remove automatically after 5 seconds
    setTimeout(() => {
        dismissToast(toast);
    }, 5000);
}

// Function to translate Firebase error codes to friendly Arabic messages
function getFriendlyErrorMessage(error) {
    const code = error?.code || error?.message || "";
    if (code.includes("auth/invalid-credential") || code.includes("auth/user-not-found") || code.includes("auth/wrong-password")) {
        return "البريد الإلكتروني أو كلمة المرور غير صحيحة. ❌";
    }
    if (code.includes("auth/email-already-in-use")) {
        return "هذا البريد الإلكتروني مسجل بالفعل. 📧";
    }
    if (code.includes("auth/weak-password")) {
        return "كلمة المرور ضعيفة جداً (يجب أن تكون 6 أحرف على الأقل). 🔒";
    }
    if (code.includes("auth/invalid-email")) {
        return "صيغة البريد الإلكتروني غير صحيحة. ✉️";
    }
    if (code.includes("auth/network-request-failed")) {
        return "مشكلة في الاتصال بالإنترنت. 🌐";
    }
    // Default error message
    return "حدث خطأ ما، يرجى المحاولة مرة أخرى.";
}

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
                showToast("تم تسجيل الدخول بنجاح! 🎉", "success");
            })
            .catch((error) => {
                showToast(getFriendlyErrorMessage(error), "error");
            });
    } else {
        // create new account
        createUserWithEmailAndPassword(auth, email, password)
            .then((userCredential) => {
                showToast("تم إنشاء الحساب بنجاح! 🎉 تم تسجيل دخولك تلقائياً.", "success");
            })
            .catch((error) => {
                showToast(getFriendlyErrorMessage(error), "error");
            });
    }
});

// Function to render tasks to the DOM
function renderTasks() {
    todoList.innerHTML = "";

    // Separate main tasks and subtasks
    mainTasks = allCachedTasks.filter(t => !t.parentTaskId);
    const subtasks = allCachedTasks.filter(t => t.parentTaskId);

    // Sort main tasks by order index, fallback to createdAt timestamp
    mainTasks.sort((a, b) => {
        const orderA = a.order !== undefined ? a.order : (a.createdAt?.seconds || 0);
        const orderB = b.order !== undefined ? b.order : (b.createdAt?.seconds || 0);
        return orderA - orderB;
    });

    mainTasks.forEach((task) => {
        // Find if this main task has subtasks
        const currentSubtasks = subtasks.filter(sub => sub.parentTaskId === task.id);
        const hasSubtasks = currentSubtasks.length > 0;
        const isCollapsed = collapsedTaskIds.has(task.id);

        // 1. Render Main Task
        const li = document.createElement("li");
        li.className = "main-task-item";
        li.setAttribute("data-id", task.id);
        li.setAttribute("draggable", "true");
        li.innerHTML = `
            <div class="task-content">
                ${hasSubtasks ? `<button class="collapse-btn" data-id="${task.id}">${isCollapsed ? '◁' : '▽'}</button>` : '<span class="collapse-placeholder"></span>'}
                <input type="checkbox" class="task-checkbox" data-id="${task.id}" ${task.completed ? 'checked' : ''}>
                <span class="task-text ${task.completed ? 'completed' : ''}">${task.text} ${task.recurring ? '🔄' : ''}</span>
            </div>
            <div class="task-actions">
                <button class="add-subtask-btn" data-parent-id="${task.id}">+</button>
                <button class="delete-btn" data-id="${task.id}">مسح</button>
            </div>
        `;
        todoList.appendChild(li);

        // Render subtasks and input only if NOT collapsed
        if (!isCollapsed) {
            // 2. Render Subtasks for this Main Task
            currentSubtasks.sort((a, b) => (a.createdAt?.seconds || 0) - (b.createdAt?.seconds || 0));

            currentSubtasks.forEach((sub) => {
                const subLi = document.createElement("li");
                subLi.className = "subtask-item";
                subLi.setAttribute("data-id", sub.id);
                subLi.innerHTML = `
                    <div class="task-content">
                        <input type="checkbox" class="subtask-checkbox" data-id="${sub.id}" data-parent-id="${task.id}" ${sub.completed ? 'checked' : ''}>
                        <span class="task-text ${sub.completed ? 'completed' : ''}">${sub.text}</span>
                    </div>
                    <button class="delete-btn" data-id="${sub.id}">مسح</button>
                `;
                todoList.appendChild(subLi);
            });

            // 3. Render Subtask Input Container if active
            if (activeSubtaskFormId === task.id) {
                const subtaskForm = document.createElement("div");
                subtaskForm.className = "subtask-input-container";
                subtaskForm.innerHTML = `
                    <input type="text" class="subtask-input" id="subtask-input-${task.id}" placeholder="اكتب مهمة فرعية...">
                    <button class="save-subtask-btn" data-parent-id="${task.id}">إضافة</button>
                `;
                todoList.appendChild(subtaskForm);
            }
        }
    });

    setupDeleteButtons();
    setupCheckboxListeners();
    setupSubtaskFormListeners();
    setupCollapseListeners();
    setupDragAndDrop();
}

// setup collapse/expand click listeners
function setupCollapseListeners() {
    const collapseBtns = document.querySelectorAll(".collapse-btn");
    collapseBtns.forEach(btn => {
        btn.addEventListener("click", (e) => {
            const id = e.target.getAttribute("data-id");
            if (collapsedTaskIds.has(id)) {
                collapsedTaskIds.delete(id);
            } else {
                collapsedTaskIds.add(id);
            }
            renderTasks(); // Redraw UI instantly
        });
    });
}

// Function to start listening to user's todos
function startListeningToTodos(userId) {
    if (unsubscribeTodos) {
        unsubscribeTodos();
    }

    const q = query(collection(db, "todos"), where("userId", "==", userId));

    unsubscribeTodos = onSnapshot(q, (snapshot) => {
        allCachedTasks = [];

        snapshot.forEach((documentSnapshot) => {
            allCachedTasks.push({
                id: documentSnapshot.id,
                ...documentSnapshot.data()
            });
        });

        renderTasks();
    }, (error) => {
        console.error("خطأ أثناء جلب المهام: ", error);
    });
}

// setup checkbox click listeners
function setupCheckboxListeners() {
    // 1. Main tasks checkboxes
    const mainCheckboxes = document.querySelectorAll(".task-checkbox");
    mainCheckboxes.forEach(chk => {
        chk.addEventListener("change", async (e) => {
            const id = e.target.getAttribute("data-id");
            const completed = e.target.checked;
            
            try {
                const batch = writeBatch(db);
                
                // Update parent
                batch.update(doc(db, "todos", id), { completed: completed });
                
                // Update all its subtasks
                const childSubtasks = allCachedTasks.filter(t => t.parentTaskId === id);
                childSubtasks.forEach(sub => {
                    batch.update(doc(db, "todos", sub.id), { completed: completed });
                });
                
                await batch.commit();
            } catch (error) {
                showToast("خطأ أثناء تحديث حالة المهمة", "error");
                console.error("خطأ أثناء تحديث المهمة: ", error);
                e.target.checked = !completed;
            }
        });
    });

    // 2. Subtasks checkboxes
    const subCheckboxes = document.querySelectorAll(".subtask-checkbox");
    subCheckboxes.forEach(chk => {
        chk.addEventListener("change", async (e) => {
            const id = e.target.getAttribute("data-id");
            const parentId = e.target.getAttribute("data-parent-id");
            const completed = e.target.checked;
            
            try {
                const batch = writeBatch(db);
                
                // Update the subtask
                batch.update(doc(db, "todos", id), { completed: completed });
                
                // Check siblings to decide parent status
                const siblings = allCachedTasks.filter(t => t.parentTaskId === parentId && t.id !== id);
                const allSiblingsCompleted = siblings.every(s => s.completed);
                
                if (completed && allSiblingsCompleted) {
                    // Mark parent as completed
                    batch.update(doc(db, "todos", parentId), { completed: true });
                } else if (!completed) {
                    // Mark parent as incomplete
                    batch.update(doc(db, "todos", parentId), { completed: false });
                }
                
                await batch.commit();
            } catch (error) {
                showToast("خطأ أثناء تحديث حالة المهمة الفرعية", "error");
                console.error("خطأ أثناء تحديث المهمة الفرعية: ", error);
                e.target.checked = !completed;
            }
        });
    });
}

// setup subtask form listeners (adding subtasks)
function setupSubtaskFormListeners() {
    // 1. Toggle input container
    const addSubtaskBtns = document.querySelectorAll(".add-subtask-btn");
    addSubtaskBtns.forEach(btn => {
        btn.addEventListener("click", (e) => {
            const parentId = e.target.getAttribute("data-parent-id");
            if (activeSubtaskFormId === parentId) {
                activeSubtaskFormId = null;
            } else {
                activeSubtaskFormId = parentId;
            }
            renderTasks(); // Redraw UI instantly
        });
    });

    // 2. Save subtask button
    const saveSubtaskBtns = document.querySelectorAll(".save-subtask-btn");
    saveSubtaskBtns.forEach(btn => {
        btn.addEventListener("click", async (e) => {
            const parentId = e.target.getAttribute("data-parent-id");
            const inputField = document.getElementById(`subtask-input-${parentId}`);
            const subtaskText = inputField.value.trim();
            const user = auth.currentUser;

            if (!user) return;
            if (subtaskText === "") {
                showToast("اكتب شيئاً أولاً!", "info");
                return;
            }

            try {
                addDoc(collection(db, "todos"), {
                    text: subtaskText,
                    createdAt: new Date(),
                    userId: user.uid,
                    completed: false,
                    recurring: false, // subtasks are not recurring by default
                    parentTaskId: parentId // link to parent
                }).catch((error) => {
                    showToast("خطأ أثناء إضافة المهمة الفرعية", "error");
                });

                activeSubtaskFormId = null; // close input after sending
                renderTasks();
            } catch (error) {
                console.error("خطأ أثناء إضافة مهمة فرعية: ", error);
            }
        });
    });
}

// setup Drag & Drop reordering support
let draggedId = null;

function setupDragAndDrop() {
    const items = document.querySelectorAll(".main-task-item");
    items.forEach(item => {
        item.addEventListener("dragstart", (e) => {
            draggedId = item.getAttribute("data-id");
            item.classList.add("dragging");
            e.dataTransfer.effectAllowed = "move";
        });

        item.addEventListener("dragend", () => {
            item.classList.remove("dragging");
            items.forEach(i => i.classList.remove("drag-over-top", "drag-over-bottom"));
        });

        item.addEventListener("dragover", (e) => {
            e.preventDefault();
            if (item.getAttribute("data-id") !== draggedId) {
                const rect = item.getBoundingClientRect();
                const relativeY = e.clientY - rect.top;
                const isUpperHalf = relativeY < rect.height / 2;
                
                if (isUpperHalf) {
                    item.classList.add("drag-over-top");
                    item.classList.remove("drag-over-bottom");
                } else {
                    item.classList.add("drag-over-bottom");
                    item.classList.remove("drag-over-top");
                }
            }
        });

        item.addEventListener("dragleave", () => {
            item.classList.remove("drag-over-top", "drag-over-bottom");
        });

        item.addEventListener("drop", async (e) => {
            e.preventDefault();
            const rect = item.getBoundingClientRect();
            const relativeY = e.clientY - rect.top;
            const isUpperHalf = relativeY < rect.height / 2;
            const position = isUpperHalf ? 'before' : 'after';

            item.classList.remove("drag-over-top", "drag-over-bottom");
            const targetId = item.getAttribute("data-id");
            if (draggedId && targetId && draggedId !== targetId) {
                await handleTaskReorder(draggedId, targetId, position);
            }
        });
    });
}

// Handle local array rearrangement and commit to Firestore
async function handleTaskReorder(draggedId, targetId, position) {
    const draggedIndex = mainTasks.findIndex(t => t.id === draggedId);
    let targetIndex = mainTasks.findIndex(t => t.id === targetId);
    
    if (draggedIndex === -1 || targetIndex === -1) return;

    // Rearrange in array
    const [draggedItem] = mainTasks.splice(draggedIndex, 1);
    
    // Re-locate target index since array length changed
    targetIndex = mainTasks.findIndex(t => t.id === targetId);

    if (position === 'after') {
        mainTasks.splice(targetIndex + 1, 0, draggedItem);
    } else {
        mainTasks.splice(targetIndex, 0, draggedItem);
    }

    try {
        const batch = writeBatch(db);
        mainTasks.forEach((task, idx) => {
            batch.update(doc(db, "todos", task.id), { order: idx });
        });
        await batch.commit();
    } catch (error) {
        showToast("خطأ أثناء إعادة الترتيب", "error");
        console.error("خطأ في إعادة الترتيب: ", error);
    }
}

// Function to check and run daily cleanup at dawn (4:00 AM)
async function checkAndRunCleanup(userId) {
    const today = new Date();
    const cleanupKey = `lastCleanupDate_${userId}`;
    const lastCleanup = localStorage.getItem(cleanupKey);

    const todaysDawn = new Date(today);
    todaysDawn.setHours(4, 0, 0, 0);

    let needsCleanup = false;
    if (!lastCleanup) {
        needsCleanup = true;
    } else {
        const lastCleanupDate = new Date(lastCleanup);
        if (lastCleanupDate < todaysDawn && today >= todaysDawn) {
            needsCleanup = true;
        }
    }

    if (needsCleanup) {
        console.log("جارٍ تشغيل التنظيف التلقائي الفجر للمهام...");
        try {
            const q = query(collection(db, "todos"), where("userId", "==", userId));
            const querySnapshot = await getDocs(q);
            
            const batch = writeBatch(db);
            let hasOperations = false;

            querySnapshot.forEach((docSnap) => {
                const task = docSnap.data();
                const taskId = docSnap.id;

                if (task.completed === true) {
                    const taskRef = doc(db, "todos", taskId);
                    if (task.recurring === true) {
                        batch.update(taskRef, { completed: false });
                        hasOperations = true;
                    } else {
                        batch.delete(taskRef);
                        hasOperations = true;
                    }
                }
            });

            if (hasOperations) {
                await batch.commit();
                showToast("تم تنظيف وتصفير المهام لليوم الجديد! 🧹", "success");
            }
            
            localStorage.setItem(cleanupKey, today.toISOString());
        } catch (error) {
            console.error("خطأ أثناء التنظيف التلقائي: ", error);
        }
    }
}

// switch login mode and user mode
onAuthStateChanged(auth, (user) => {
    if (user) {
        // show todo list and hide login form
        authContainer.classList.add('hidden');
        todoContainer.classList.remove('hidden');
        console.log("المستخدم الحالي:", user.uid);
        
        // Reset subtask forms state
        activeSubtaskFormId = null;
        
        // Run daily cleanup first
        checkAndRunCleanup(user.uid);
        
        // Start listening to user's tasks
        startListeningToTodos(user.uid);
    } else {
        // Unsubscribe from firestore updates when logged out
        if (unsubscribeTodos) {
            unsubscribeTodos();
            unsubscribeTodos = null;
        }
        // clear UI tasks list
        todoList.innerHTML = "";
        allCachedTasks = [];
        mainTasks = [];
        activeSubtaskFormId = null;

        // show login form and hide todo list
        authContainer.classList.remove('hidden');
        todoContainer.classList.add('hidden');
    }
});

// add new task to firebase
addBtn.addEventListener("click", async () => {
    const taskText = todoInput.value.trim();
    const user = auth.currentUser;
    
    if (!user) {
        showToast("يجب تسجيل الدخول أولاً!", "error");
        return;
    }
    
    if (taskText === "") {
        showToast("ايه المهمه الفاضيه دي 😆", "info");
        return;
    }

    try {
        const isRecurring = todoRecurring.checked;
        
        // Run without await so the input field clears immediately (even when offline)
        addDoc(collection(db, "todos"), {
            text: taskText,
            createdAt: new Date(),
            userId: user.uid, // associate task with the authenticated user
            completed: false,
            recurring: isRecurring
        }).catch((error) => {
            showToast("خطأ أثناء إضافة المهمة", "error");
            console.error("خطأ أثناء إضافة المهمة في الخلفية: ", error);
        });
        
        todoInput.value = ""; 
        todoRecurring.checked = false; // reset checkbox
    } catch (error) {
        showToast("خطأ أثناء إضافة المهمة", "error");
        console.error("خطا اثناء إضافة المهمه: ", error);
    }
});

// delete task from firebase
function setupDeleteButtons() {
    const deleteButtons = document.querySelectorAll(".delete-btn");
    deleteButtons.forEach(btn => {
        btn.replaceWith(btn.cloneNode(true)); // remove old listeners to prevent duplicates
    });
    
    const newDeleteButtons = document.querySelectorAll(".delete-btn");
    newDeleteButtons.forEach(btn => {
        btn.addEventListener("click", async (e) => {
            const id = e.target.getAttribute("data-id");
            try {
                // Find and delete subtasks if this is a parent task
                const childSubtasks = allCachedTasks.filter(t => t.parentTaskId === id);
                if (childSubtasks.length > 0) {
                    const batch = writeBatch(db);
                    childSubtasks.forEach(sub => {
                        batch.delete(doc(db, "todos", sub.id));
                    });
                    batch.delete(doc(db, "todos", id));
                    await batch.commit();
                } else {
                    await deleteDoc(doc(db, "todos", id));
                }
            } catch (error) {
                console.error("خطأ أثناء مسح المهمة: ", error);
            }
        });
    });
}

// sign in with google
googleBtn.addEventListener('click', () => {
    signInWithPopup(auth, provider)
        .then((result) => {
            showToast("تم تسجيل الدخول بحساب جوجل بنجاح! 🚀", "success");
        })
        .catch((error) => {
            showToast(getFriendlyErrorMessage(error), "error");
        });
});

// sign out button listener
logoutBtn.addEventListener("click", () => {
    auth.signOut().then(() => {
        showToast("تم تسجيل الخروج بنجاح!", "success");
    }).catch((error) => {
        showToast(getFriendlyErrorMessage(error), "error");
    });
});

// Register Service Worker for PWA (offline reload capability)
if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('/sw.js')
            .then((reg) => {
                console.log('Service Worker registered successfully with scope:', reg.scope);
            })
            .catch((err) => {
                console.error('Service Worker registration failed:', err);
            });
    });
}