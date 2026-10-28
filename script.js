
const API = "https://taskflow-task-management-system-q1g9.onrender.com/api";

let token = localStorage.getItem("taskToken") || "";
let user = null;
let tasks = [];
let editingId = null;
let authMode = "login";

try {
  user = JSON.parse(localStorage.getItem("taskUser")) || null;
} catch {
  user = null;
}

const $ = (id) => document.getElementById(id);

function showMessage(id, text) {
  $(id).textContent = text;
}

function setLoggedIn(isLoggedIn) {
  $("authSection").classList.toggle("hidden", isLoggedIn);
  $("taskSection").classList.toggle("hidden", !isLoggedIn);
  $("logoutBtn").classList.toggle("hidden", !isLoggedIn);
}

async function api(path, options = {}) {
  const response = await fetch(API + path, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options.headers
    }
  });

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    if (response.status === 401 && token) logout();
    throw new Error(data.message || "Request failed");
  }

  return data;
}

function logout() {
  token = "";
  user = null;
  tasks = [];

  localStorage.removeItem("taskToken");
  localStorage.removeItem("taskUser");

  setLoggedIn(false);
  resetTaskForm();
  showMessage("authMessage", "");
}

$("logoutBtn").addEventListener("click", logout);

$("switchAuth").addEventListener("click", (event) => {
  event.preventDefault();

  authMode = authMode === "login" ? "register" : "login";

  $("name").classList.toggle("hidden", authMode !== "register");
  $("name").required = authMode === "register";
  $("authTitle").textContent =
    authMode === "login" ? "Welcome Back!" : "Create Account";
  $("authBtn").textContent =
    authMode === "login" ? "Login" : "Register";
  $("switchText").innerHTML =
    authMode === "login"
      ? 'Don\'t have an account? <a href="#" id="switchAuth">Register</a>'
      : 'Already have an account? <a href="#" id="switchAuth">Login</a>';

  // Reattach the event after changing the link
  $("switchAuth").addEventListener("click", (e) => {
    e.preventDefault();
    toggleAuthMode();
  });

  showMessage("authMessage", "");
});

function toggleAuthMode() {
  authMode = authMode === "login" ? "register" : "login";
  $("name").classList.toggle("hidden", authMode !== "register");
  $("name").required = authMode === "register";
  $("authTitle").textContent =
    authMode === "login" ? "Welcome Back!" : "Create Account";
  $("authBtn").textContent =
    authMode === "login" ? "Login" : "Register";
  $("switchText").innerHTML =
    authMode === "login"
      ? 'Don\'t have an account? <a href="#" id="switchAuth">Register</a>'
      : 'Already have an account? <a href="#" id="switchAuth">Login</a>';
  $("switchAuth").addEventListener("click", (e) => {
    e.preventDefault();
    toggleAuthMode();
  });
}

$("authForm").addEventListener("submit", async (event) => {
  event.preventDefault();

  const button = $("authBtn");
  button.disabled = true;
  showMessage("authMessage", "");

  try {
    const payload = {
      email: $("email").value.trim(),
      password: $("password").value
    };

    if (authMode === "register") {
      payload.name = $("name").value.trim();

      await api("/auth/register", {
        method: "POST",
        body: JSON.stringify(payload)
      });

      authMode = "login";
      $("name").classList.add("hidden");
      $("name").required = false;
      $("authTitle").textContent = "Welcome Back!";
      $("authBtn").textContent = "Login";
      $("switchText").innerHTML =
        'Don\'t have an account? <a href="#" id="switchAuth">Register</a>';
      $("switchAuth").addEventListener("click", (e) => {
        e.preventDefault();
        toggleAuthMode();
      });

      showMessage("authMessage", "Registration successful! Please login.");
      $("password").value = "";
      return;
    }

    const data = await api("/auth/login", {
      method: "POST",
      body: JSON.stringify(payload)
    });

    token = data.token;
    user = data.user;

    localStorage.setItem("taskToken", token);
    localStorage.setItem("taskUser", JSON.stringify(user));

    setLoggedIn(true);
    await loadTasks();
  } catch (error) {
    showMessage("authMessage", error.message);
  } finally {
    button.disabled = false;
  }
});

async function loadTasks() {
  if (!token) return;

  try {
    tasks = await api("/tasks");
    renderTasks();
  } catch (error) {
    showMessage("taskMessage", error.message);
  }
}

$("taskForm").addEventListener("submit", async (event) => {
  event.preventDefault();

  const title = $("taskTitle").value.trim();
  const description = $("taskDescription").value.trim();

  if (!title) {
    showMessage("taskMessage", "Please enter a task title");
    return;
  }

  const button = $("saveBtn");
  button.disabled = true;

  try {
    if (editingId !== null) {
      const task = tasks.find((t) => t.id === editingId);

      await api(`/tasks/${editingId}`, {
        method: "PUT",
        body: JSON.stringify({
          title,
          description,
          status: task.status
        })
      });

      showMessage("taskMessage", "Task updated successfully!");
    } else {
      await api("/tasks", {
        method: "POST",
        body: JSON.stringify({ title, description })
      });

      showMessage("taskMessage", "Task created successfully!");
    }

    resetTaskForm();
    await loadTasks();
  } catch (error) {
    showMessage("taskMessage", error.message);
  } finally {
    button.disabled = false;
  }
});

function resetTaskForm() {
  editingId = null;
  $("taskForm").reset();
  $("formTitle").textContent = "Add New Task";
  $("saveBtn").textContent = "Add Task";
  $("cancelBtn").classList.add("hidden");
}

$("cancelBtn").addEventListener("click", resetTaskForm);

async function toggleTask(id) {
  const task = tasks.find((t) => t.id === id);
  if (!task) return;

  try {
    await api(`/tasks/${id}`, {
      method: "PUT",
      body: JSON.stringify({
        title: task.title,
        description: task.description || "",
        status: task.status === "Completed" ? "Pending" : "Completed"
      })
    });

    await loadTasks();
  } catch (error) {
    showMessage("taskMessage", error.message);
  }
}

function editTask(id) {
  const task = tasks.find((t) => t.id === id);
  if (!task) return;

  editingId = id;
  $("taskTitle").value = task.title;
  $("taskDescription").value = task.description || "";
  $("formTitle").textContent = "Edit Task";
  $("saveBtn").textContent = "Save Changes";
  $("cancelBtn").classList.remove("hidden");

  window.scrollTo({ top: 0, behavior: "smooth" });
}

async function deleteTask(id) {
  if (!confirm("Are you sure you want to delete this task?")) return;

  try {
    await api(`/tasks/${id}`, { method: "DELETE" });
    showMessage("taskMessage", "Task deleted successfully!");
    await loadTasks();
  } catch (error) {
    showMessage("taskMessage", error.message);
  }
}

$("filter").addEventListener("change", renderTasks);

function renderTasks() {
  $("totalTasks").textContent = tasks.length;
  $("pendingTasks").textContent =
    tasks.filter((t) => t.status === "Pending").length;
  $("completedTasks").textContent =
    tasks.filter((t) => t.status === "Completed").length;

  const filter = $("filter").value;
  const filtered = tasks.filter(
    (task) => filter === "All" || task.status === filter
  );

  const list = $("taskList");
  list.replaceChildren();

  if (filtered.length === 0) {
    const empty = document.createElement("div");
    empty.className = "empty";
    empty.textContent = "No tasks found. Add your first task!";
    list.appendChild(empty);
    return;
  }

  filtered.forEach((task) => {
    const article = document.createElement("article");
    article.className = "task";

    const top = document.createElement("div");
    top.className = "task-top";

    const heading = document.createElement("h3");
    heading.textContent = task.title;
    if (task.status === "Completed") heading.className = "done";

    const badge = document.createElement("span");
    badge.className = `status ${task.status}`;
    badge.textContent = task.status;

    top.append(heading, badge);
    article.appendChild(top);

    if (task.description) {
      const desc = document.createElement("p");
      desc.textContent = task.description;
      article.appendChild(desc);
    }

    const actions = document.createElement("div");
    actions.className = "task-actions";

    const completeBtn = document.createElement("button");
    completeBtn.className = "secondary";
    completeBtn.textContent =
      task.status === "Completed" ? "Reopen" : "Complete";
    completeBtn.addEventListener("click", () => toggleTask(task.id));

    const editBtn = document.createElement("button");
    editBtn.className = "secondary";
    editBtn.textContent = "Edit";
    editBtn.addEventListener("click", () => editTask(task.id));

    const deleteBtn = document.createElement("button");
    deleteBtn.className = "danger";
    deleteBtn.textContent = "Delete";
    deleteBtn.addEventListener("click", () => deleteTask(task.id));

    actions.append(completeBtn, editBtn, deleteBtn);
    article.appendChild(actions);
    list.appendChild(article);
  });
}

if (token && user) {
  setLoggedIn(true);
  loadTasks();
} else {
  setLoggedIn(false);
}
