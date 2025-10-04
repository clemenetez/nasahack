# 🚀 NASA Habitat Layout Creator - Setup Guide

## Quick Start (Browser Only)

1. **Open the application**: Double-click `index.html` or open it in any modern browser
2. **Start designing**: Drag objects from the left panel to the habitat canvas
3. **Use keyboard shortcuts**:
   - `R` - Rotate selected object
   - `Del` - Delete selected object  
   - `Ctrl+D` - Duplicate selected object
   - `C` - Switch to cable tool
   - `V` - Switch to select tool

## Optional: AI Server Setup

For enhanced AI suggestions using Gemini:

1. **Install Node.js** (version 18 or higher)
2. **Install dependencies**:
   ```bash
   npm install
   ```
3. **Set up Gemini API key**:
   - Get API key from [Google AI Studio](https://makersuite.google.com/app/apikey)
   - Set environment variable:
     ```bash
     # Windows
     set GEMINI_API_KEY=your_api_key_here
     
     # macOS/Linux  
     export GEMINI_API_KEY=your_api_key_here
     ```
4. **Start the server**:
   ```bash
   npm start
   ```
5. **Switch AI source**: In the app, change AI source from "Local" to "Gemini"

## Features

✅ **Auto-save**: All changes automatically saved to browser storage  
✅ **Real-time validation**: NASA safety rules enforced  
✅ **Visual feedback**: Color-coded error/warning overlays  
✅ **Export/Import**: Save and share layouts as JSON files  
✅ **Statistics**: Live tracking of objects, free space, and issues  

## Troubleshooting

- **Server won't start**: Make sure Node.js 18+ is installed
- **AI not working**: Check that GEMINI_API_KEY is set correctly
- **Objects not saving**: Check browser localStorage is enabled
- **Canvas not responding**: Try refreshing the page

## Browser Compatibility

- ✅ Chrome 90+
- ✅ Firefox 88+  
- ✅ Safari 14+
- ✅ Edge 90+

---

*Ready to design your space habitat! 🚀*
