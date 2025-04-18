const container = document.querySelector(".container");
const chatsContainer = document.querySelector(".chats-container");
const promptForm = document.querySelector(".prompt-form");
const promptInput = promptForm.querySelector(".prompt-input");
const fileInput = promptForm.querySelector("#file-input");
const fileUploadWrapper = promptForm.querySelector(".file-upload-wrapper");
const themeToggleBtn = document.querySelector("#theme-toggle-btn");
let currentChatId = null;
// API Setup
const API_KEY = "AIzaSyCwoRAg4skQVi5_vANHeNhVjW31s_O6KIs";
const API_URL = "/api/gemini";
let controller, typingInterval;
const chatHistory = [];
const userData = { message: "", file: {} };
// Set initial theme from local storage
const isLightTheme = localStorage.getItem("themeColor") === "light_mode";
document.body.classList.toggle("light-theme", isLightTheme);
themeToggleBtn.textContent = isLightTheme ? "dark_mode" : "light_mode";
// Function to create message elements
const createMessageElement = (content, ...classes) => {
    const div = document.createElement("div");
    div.classList.add("message", ...classes);
    div.innerHTML = content;
    return div;
};
// Scroll to the bottom of the container
const scrollToBottom = () => container.scrollTo({ top: container.scrollHeight, behavior: "smooth" });
// Simulate typing effect for bot responses
const typingEffect = (text, textElement, botMsgDiv) => {
  textElement.innerHTML = "";
  const words = text.split(" ");
  let wordIndex = 0;

  typingInterval = setInterval(() => {
      if (wordIndex < words.length) {
          const partialText = words.slice(0, wordIndex + 1).join(" ");
          textElement.innerHTML = marked.parse(partialText);

          // Highlight code and add copy buttons
          textElement.querySelectorAll("pre code").forEach((block, i) => {
              hljs.highlightElement(block);

              if (!block.parentElement.querySelector(".copy-btn")) {
                  const copyBtn = document.createElement("button");
                  copyBtn.className = "copy-btn material-symbols-rounded";
                  copyBtn.innerText = "content_copy";
                  copyBtn.title = "Copy code";
                  copyBtn.onclick = () => {
                      navigator.clipboard.writeText(block.textContent).then(() => {
                          copyBtn.innerText = "check_circle";
                          setTimeout(() => copyBtn.innerText = "content_copy", 1500);
                      });
                  };
                  block.parentElement.style.position = "relative";
                  block.parentElement.appendChild(copyBtn);
              }
          });

          wordIndex++;
          scrollToBottom();
      } else {
        clearInterval(typingInterval);
        botMsgDiv.classList.remove("loading");
        document.body.classList.remove("bot-responding");
        
        // Get the full HTML after rendering is complete
        setTimeout(() => {
          const chatContent = Array.from(chatsContainer.children).map(div => ({
            html: div.outerHTML,
            classes: Array.from(div.classList)
          }));
          
          // Use the first user message as title if no title exists
          const userMessages = chatContent.filter(msg => msg.classes.includes('user-message'));
          const chatTitle = userMessages.length > 0 
            ? userMessages[0].html.match(/<p class="message-text">(.*?)<\/p>/)?.[1]?.slice(0, 40) + (userMessages[0].html.length > 40 ? "..." : "")
            : "New Chat";
            
          saveChat(chatTitle, chatContent);
        }, 100);
      }
  }, 40);
};

// Make the API call and generate the bot's response
const generateResponse = async(botMsgDiv) => {
    const textElement = botMsgDiv.querySelector(".message-text");
    controller = new AbortController();
    // Add user message and file data to the chat history
    chatHistory.push({
        role: "user",
        parts: [{ text: userData.message }, ...(userData.file.data ? [{ inline_data: (({ fileName, isImage, ...rest }) => rest)(userData.file) }] : [])],
    });
    try {
        // Send the chat history to the API to get a response
        const response = await fetch(API_URL, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ contents: chatHistory }),
            signal: controller.signal,
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error.message);
        // Process the response text and display with typing effect
        const responseText = data.candidates[0].content.parts[0].text.replace(/\*\*([^*]+)\*\*/g, "$1").trim();
        typingEffect(responseText, textElement, botMsgDiv);
        chatHistory.push({ role: "model", parts: [{ text: responseText }] });
        // Save chat after bot response
        const chatTitle = userData.message.split("\n").pop().slice(0, 40) + "...";
        const chatContent = Array.from(chatsContainer.children).map(div => ({
          html: div.innerHTML,
          classes: Array.from(div.classList)
       }));
        saveChat(chatTitle, chatContent);
    } catch (error) {
        textElement.textContent = error.name === "AbortError" ? "Response generation stopped." : error.message;
        textElement.style.color = "#d62939";
        botMsgDiv.classList.remove("loading");
        document.body.classList.remove("bot-responding");
        scrollToBottom();
    } finally {
        userData.file = {};
    }
};
// Handle the form submission
const handleFormSubmit = (e) => {
  e.preventDefault();

  const rawMessage = promptInput.value.trim();
  const selectedTone = document.getElementById("tone-select").value;

  if (!rawMessage || document.body.classList.contains("bot-responding")) return;

  let userMessage = rawMessage;
  if (selectedTone) {
      userMessage = `Respond in a ${selectedTone} tone:\n` + rawMessage;
  }
  userData.message = userMessage;

  promptInput.value = "";
  promptInput.style.height = "auto";
  document.body.classList.add("chats-active", "bot-responding");
  fileUploadWrapper.classList.remove("file-attached", "img-attached", "active");

  // Create user message element
  const userMsgHTML = `
    <p class="message-text">${rawMessage}</p>
    ${userData.file.data
      ? (userData.file.isImage
          ? `<img src="data:${userData.file.mime_type};base64,${userData.file.data}" class="img-attachment" />`
          : `<p class="file-attachment"><span class="material-symbols-rounded">description</span>${userData.file.fileName}</p>`)
      : ""}
  `;
  const userMsgDiv = createMessageElement(userMsgHTML, "user-message");
  chatsContainer.appendChild(userMsgDiv);
  scrollToBottom();

  // Create bot message placeholder
  setTimeout(() => {
    const botMsgHTML = `
      <img class="avatar" src="gemini.svg" />
      <div class="message-text">Just a sec...</div>
    `;  
    const botMsgDiv = createMessageElement(botMsgHTML, "bot-message", "loading");
    chatsContainer.appendChild(botMsgDiv);
    scrollToBottom();
    generateResponse(botMsgDiv);
    
    // Save the user message immediately
    const chatContent = Array.from(chatsContainer.children).map(div => ({
      html: div.outerHTML,
      classes: Array.from(div.classList)
    }));
    saveChat(rawMessage.slice(0, 40) + (rawMessage.length > 40 ? "..." : ""), chatContent);
  }, 600);
};

// Handle file input change (file upload)
fileInput.addEventListener("change", () => {
  const file = fileInput.files[0];
  if (!file) return;
  const isImage = file.type.startsWith("image/");
  const reader = new FileReader();
  reader.readAsDataURL(file);
  reader.onload = (e) => {
    fileInput.value = "";
    const base64String = e.target.result.split(",")[1];
    fileUploadWrapper.querySelector(".file-preview").src = e.target.result;
    fileUploadWrapper.classList.add("active", isImage ? "img-attached" : "file-attached");
    // Store file data in userData obj
    userData.file = { fileName: file.name, data: base64String, mime_type: file.type, isImage };
  };
});
// Cancel file upload
document.querySelector("#cancel-file-btn").addEventListener("click", () => {
  userData.file = {};
  fileUploadWrapper.classList.remove("file-attached", "img-attached", "active");
});
// Stop Bot Response
document.querySelector("#stop-response-btn").addEventListener("click", () => {
  controller?.abort();
  userData.file = {};
  clearInterval(typingInterval);
  chatsContainer.querySelector(".bot-message.loading").classList.remove("loading");
  document.body.classList.remove("bot-responding");
});
// Toggle dark/light theme
themeToggleBtn.addEventListener("click", () => {
  const isLightTheme = document.body.classList.toggle("light-theme");
  localStorage.setItem("themeColor", isLightTheme ? "light_mode" : "dark_mode");
  themeToggleBtn.textContent = isLightTheme ? "dark_mode" : "light_mode";
});
// Delete all chats
//document.querySelector("#delete-chats-btn").addEventListener("click", () => {
  //chatHistory.length = 0;
  //chatsContainer.innerHTML = "";
  //document.body.classList.remove("chats-active", "bot-responding");
//});
// Handle suggestions click
document.querySelectorAll(".suggestions-item").forEach((suggestion) => {
  suggestion.addEventListener("click", () => {
    promptInput.value = suggestion.querySelector(".text").textContent;
    promptForm.dispatchEvent(new Event("submit"));
  });
});
// Show/hide controls for mobile on prompt input focus
document.addEventListener("click", ({ target }) => {
  const wrapper = document.querySelector(".prompt-wrapper");
  const shouldHide = target.classList.contains("prompt-input") || (wrapper.classList.contains("hide-controls") && (target.id === "add-file-btn" || target.id === "stop-response-btn"));
  wrapper.classList.toggle("hide-controls", shouldHide);
});
// Add event listeners for form submission and file input click
promptForm.addEventListener("submit", handleFormSubmit);
promptForm.querySelector("#add-file-btn").addEventListener("click", () => fileInput.click());
const voiceBtn = document.getElementById("voice-search-btn");

voiceBtn.addEventListener("click", () => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
        alert("Voice recognition is not supported in this browser.");
        return;
    }

    const recognition = new SpeechRecognition();
    recognition.lang = "en-US";
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;

    // Add listening class for animation
    voiceBtn.classList.add("listening");

    recognition.start();

    recognition.onresult = (event) => {
        const transcript = event.results[0][0].transcript;
        document.querySelector(".prompt-input").value = transcript;
        document.querySelector(".prompt-form").dispatchEvent(new Event("submit"));
    };

    recognition.onerror = (event) => {
        console.error("Speech recognition error:", event.error);
        alert("Voice recognition failed: " + event.error);
    };

    recognition.onend = () => {
        // Remove animation class when finished
        voiceBtn.classList.remove("listening");
    };
});
const sidebar = document.querySelector(".sidebar");
const toggleSidebarBtn = document.getElementById("toggle-sidebar");
const closeSidebarBtn = document.getElementById("close-sidebar");
const historyList = document.getElementById("chat-history-list");

let savedChats = JSON.parse(localStorage.getItem("jbot_chats")) || [];

// Sidebar open/close
toggleSidebarBtn.addEventListener("click", () => {
  sidebar.classList.toggle("open");
});

// Save chat to localStorage
function saveChat(title, messages) {
  if (!title || !messages || messages.length === 0) return;
  
  if (currentChatId) {
      const index = savedChats.findIndex(chat => chat.id === currentChatId);
      if (index !== -1) {
          savedChats[index].messages = messages;
          savedChats[index].title = title;
      }
  } else {
      currentChatId = Date.now();
      savedChats.push({ 
          id: currentChatId, 
          title: title, 
          messages: messages,
          timestamp: new Date().toISOString() // Add timestamp for sorting
      });
  }

  localStorage.setItem("jbot_chats", JSON.stringify(savedChats));
  renderHistoryList();
}

// Render saved chat sessions in sidebar
function renderHistoryList() {
  historyList.innerHTML = "";
  
  // Sort chats by timestamp (newest first)
  const sortedChats = [...savedChats].sort((a, b) => 
      new Date(b.timestamp || b.id) - new Date(a.timestamp || a.id)
  );
  
  sortedChats.forEach(chat => {
      const li = document.createElement("li");
      li.innerHTML = `
          <span>${chat.title}</span>
          <button onclick="deleteChat(${chat.id})" class="material-symbols-rounded">delete</button>
      `;
      li.addEventListener("click", (e) => {
        e.stopPropagation();
        loadChat(chat.id, e);
      });
      historyList.appendChild(li);
  });
}

// Delete a saved chat
function deleteChat(id) {
    savedChats = savedChats.filter(chat => chat.id !== id);
    localStorage.setItem("jbot_chats", JSON.stringify(savedChats));
    renderHistoryList();
}

// Load a previous chat (optional logic - you can expand this!)
function loadChat(id, event) {
  // Prevent loading if delete button was clicked
  if (event && event.target.closest('button')) return;

  const chat = savedChats.find(c => c.id === id);
  if (!chat) return;

  currentChatId = id;
  chatHistory.length = 0;
  chatsContainer.innerHTML = "";
  document.body.classList.add("chats-active");

  chat.messages.forEach(msg => {
    const div = document.createElement("div");
    div.classList.add("message", ...msg.classes.filter(c => c !== "loading"));
    div.innerHTML = msg.html;
    
    // Rebuild message content properly
    if (div.classList.contains("bot-message")) {
      const textEl = div.querySelector(".message-text");
      if (textEl) {
        const text = textEl.textContent.trim();
        chatHistory.push({ role: "model", parts: [{ text }] });
      }
    } 
    else if (div.classList.contains("user-message")) {
      const textEl = div.querySelector(".message-text");
      if (textEl) {
        const text = textEl.textContent.trim();
        chatHistory.push({ role: "user", parts: [{ text }] });
      }
    }

    chatsContainer.appendChild(div);
  });

  scrollToBottom();
  sidebar.classList.remove("open");
}

document.getElementById("new-chat-btn").addEventListener("click", () => {
  currentChatId = null;
  chatsContainer.innerHTML = "";
  chatHistory.length = 0;
  document.body.classList.remove("chats-active", "bot-responding");
  scrollToBottom();
});

renderHistoryList();