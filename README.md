# 🚀 NASA Habitat Layout Creator — MVP

A professional 2D web application for designing space habitat layouts with drag & drop functionality, NASA-inspired safety validation, and AI-powered optimization suggestions.

## ✨ Features

### 🎯 Core Functionality
- **Drag & Drop Interface**: Intuitive placement of habitat elements
- **Real-time Validation**: NASA-inspired safety and ergonomic checks
- **Visual Feedback**: Color-coded error/warning overlays
- **Auto-save**: Automatic localStorage persistence
- **Export/Import**: JSON-based layout sharing

### 🛠️ Tools & Objects

#### Basic Systems
- **Bed** (2×1m): Crew sleeping area with access zone validation
- **Panel** (1×0.5m): Control systems with required clearance
- **Cabinet** (1×1m): Storage along walls
- **Cable**: Polyline routing along walls for safety

#### Food Systems
- **Kitchen** (2×1.2m): Food preparation area with equipment
- **Dining** (1.8×1m): Crew meal area for social interaction
- **Storage** (1.2×0.8m): Food and supply storage

#### Life Support Systems
- **Atmosphere Control** (1.6×1m): Environmental regulation
- **Monitor** (1.4×0.6m): System monitoring and alerts

#### Exercise & Recreation
- **Exercise** (2.2×1.4m): Physical fitness equipment area
- **Recreation** (1.8×1.2m): Entertainment and relaxation space

#### Psychology & Privacy
- **Private Space** (1×0.8m): Individual privacy and personal time
- **Comm Station** (1.2×0.6m): Earth communication and family contact

### 🧠 AI Integration
- **Local Analysis**: Built-in NASA rule engine
- **Gemini AI**: Optional cloud-based optimization (requires API key)
- **Smart Suggestions**: Real-time layout improvement recommendations

## 🚀 Quick Start

1. **Open** `index.html` in any modern browser
2. **Create Modules**: Click "Add Module" to create multiple habitat sections
3. **Switch Modules**: Click on module names in the sidebar to switch between them
4. **Drag Objects**: Drag objects from categorized catalog to the habitat canvas
5. **Use Tools**: 
   - `R` - Rotate selected object
   - `Del` - Delete selected object
   - `Ctrl+D` - Duplicate selected object
   - `C` - Switch to cable tool
6. **Draw Cables**: Click points along walls, double-click to finish
7. **Analyze**: Press "Analyze with AI" for optimization suggestions

## 🔧 Optional: Gemini AI Setup

For enhanced AI suggestions:

1. Install Node.js 18+
2. Install dependencies: `npm i express cors node-fetch`
3. Set environment variable: `GEMINI_API_KEY=your_api_key`
4. Run server: `node server.js`
5. Switch AI source to "Gemini" in the app

## 📋 NASA Safety Rules

The application enforces these space habitat design principles:

### Basic Safety
- ✅ **Corridor Clearance**: Main passage must remain unobstructed
- ✅ **Access Zones**: Required clearance around panels and cabinets
- ✅ **No Overlaps**: Objects cannot occupy the same space
- ✅ **Wall Clearance**: 20px minimum distance from habitat walls
- ✅ **Free Space**: Minimum 30% of habitat area for crew movement
- ✅ **Cable Routing**: Must follow walls for safety
- ✅ **Sleep Quality**: Beds positioned away from control panels

### Advanced Systems
- ✅ **Food System Efficiency**: Kitchen should be near dining area
- ✅ **Exercise Placement**: Exercise areas away from sleeping zones
- ✅ **Privacy Considerations**: Private spaces for psychological well-being
- ✅ **Communication Access**: Comm stations easily accessible
- ✅ **Life Support Priority**: Critical systems have proper access zones

## 📁 Project Structure

```
├── index.html      # Main application interface
├── main.js         # Core logic, rendering, validation
├── style.css       # Dark theme styling
├── server.js       # Optional Gemini AI proxy
└── README.md       # This documentation
```

## 🎨 UI/UX Features

- **Dark Theme**: Space-appropriate dark interface
- **Multi-Module Support**: Create and manage multiple habitat modules
- **Categorized Catalog**: Objects organized by system type (Basic, Food, Life Support, etc.)
- **Real-time Stats**: Object count, free space percentage, issue tracking
- **Module Management**: Easy switching between different habitat sections
- **Visual Indicators**: 
  - 🔴 Red overlay for critical errors
  - 🟡 Yellow overlay for warnings
  - 🟢 Green hints for improvements
- **Responsive Design**: Works on desktop and tablet devices

## 🔄 Data Management

- **Auto-save**: Changes automatically saved to localStorage
- **Export**: Download layout as JSON file
- **Import**: Load previously saved layouts
- **Reset**: Clear all objects with confirmation

## 🛡️ Validation System

The application continuously validates your layout against NASA standards:

- **Error Level**: Critical issues that must be fixed
- **Warning Level**: Recommendations for safety/comfort
- **Hint Level**: Optimization suggestions

## 🚀 Future Enhancements

- **3D Visualization Mode**: Switch between 2D planning and 3D preview
- **Advanced AI Optimization**: Machine learning-based layout suggestions
- **Collaborative Editing**: Multi-user real-time editing
- **Module Connections**: Visual connections between habitat modules
- **Advanced Analytics**: Detailed crew comfort and efficiency metrics
- **Template Library**: Pre-designed habitat layouts for different mission types
- **VR Integration**: Virtual reality habitat walkthrough

## 📝 Technical Notes

- Built with vanilla JavaScript and Canvas API
- No external dependencies for core functionality
- Modular architecture for easy extension
- Cross-browser compatible (Chrome, Firefox, Safari, Edge)

---

*Designed for NASA hackathons and space habitat planning competitions*
