/**

The MIT License (MIT)

Copyright (c) 2015 Don McCurdy
Copyright (c) 2018 Alexander Pruss

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
 */

// configs

var MAX_DELTA = 200, // ms
    ROTATION_EPS = 0.000,
    QUATERNION_EPS = 0.000,
    DEFAULT_FOV = 60,
    DEG_TO_RAD = 1 / 180 * Math.PI,
    RAD_TO_DEG = 180 / Math.PI

// main

var SpaceNavigator = {
  schema: {

    // Enable/disable features
    enabled:              { default: true },
    movementEnabled:      { default: true },
    lookEnabled:          { default: true },
    rollEnabled:          { default: true },
    invertPitch:          { default: false },
    fovEnabled:           { default: false },
    fovMin:               { default: 2 },
    fovMax:               { default: 115 },

    // Constants
    rotationSensitivity:  { default: 0.05 },
    movementEasing:       { default: 3 },
    movementAcceleration: { default: 700 },
    fovSensitivity:       { default: 0.01 },
    fovEasing:            { default: 3 },
    fovAcceleration:      { default: 5 },
    invertScroll:         { default: false },
    releaseDebounceCount: { default: 2 },
	
	axisMultiply:     { default: 1 },
  },

  /**
   * Called once when component is attached. Generally for initial setup.
   */

  init: function () {
    
    var this_ = this
    
    this.lastMessage = ""

    // Movement
    this.position = new THREE.Vector3(0, 0, 0)
    this.movement = new THREE.Vector3(0, 0, 0)
    this.movementVelocity = new THREE.Vector3(0, 0, 0)
    this.movementDirection = new THREE.Vector3(0, 0, 0)

    // Rotation
    this.rotation = new THREE.Quaternion()
    
    // FOV
    this.fov = DEFAULT_FOV
    this.fovVelocity = 0

    // Button state
    this.buttons = {}
    this.releaseDebounceCount = {}

    // scroll wheel
    this.scroll = 0
    this.scrollDelta = 0

    // time
    this._previousUpdate = performance.now()
    
    // bind scroll events

    // IE, Opera, Google Chrome, Safari
    var inverScrollFactor = this.data.invertScroll ? -1 : 1
    document.addEventListener('mousewheel', function(event){
      event.preventDefault()
      this_.scroll += event.wheelDelta / 60 * inverScrollFactor
    })
    // Firefox
    document.addEventListener('DOMMouseScroll', function(event){
      event.preventDefault()
      this_.scroll -= event.detail * inverScrollFactor
    })
  },
  
  message: function(text) {
      if (this.lastMessage == text)
          return
      new iqwerty.toast.Toast(text)
      this.lastMessage = text
  },

  /**
   * AFRAME specific: Called on each iteration of main render loop.
   */
  tick: function (t, dt) {
    this.updateRotation(dt)
    this.updatePosition(dt)
    this.updateButtonState()
    if (this.data.fovEnabled) this.updateFov(dt)
  },

  /**
   * THREE specific: Called on each iteration of main render loop.
   */
  update: function (updateMovement=true,updateRotation=true) {
    var time = performance.now()
    var dt = time - this._previousUpdate
    this._previousUpdate = time

    if(updateRotation) this.updateRotation(dt)
    if(updateMovement) this.updatePosition(dt)
    this.updateButtonState()
    if (this.data.fovEnabled) this.updateFov(dt)
  },

  /*******************************************************************
   * Movement
   */

  updatePosition: function (dt) {
    var data = this.data
    var acceleration = data.movementAcceleration
    var easing = data.movementEasing
    var velocity = this.movementVelocity
    var el = this.el
    var spaceNavigator = this.getSpaceNavigator()

    // If data has changed or FPS is too low
    // we reset the velocity
    if (dt > MAX_DELTA) {
      velocity.x = 0
      velocity.y = 0
      velocity.z = 0
      return
    }

    velocity.z -= velocity.z * easing * dt / 1000
    velocity.x -= velocity.x * easing * dt / 1000
    velocity.y -= velocity.y * easing * dt / 1000

    var position = el ? el.getAttribute('position') : this.position

    if (data.enabled && data.movementEnabled && spaceNavigator) {

      /*
       * 3dconnexion space navigator position axes
       *
       * "right handed coordinate system"
       * 0: - left / + right (pos: X axis pointing to the right)
       * 1: - backwards / + forward (pos: Z axis pointing forwards)
       * 2: - up / + down (pos: Y axis pointing down)
       */

      var xDelta = this.data.axisMultiply * spaceNavigator.axes[this.data.axisMap[0]],
          yDelta = this.data.axisMultiply * - spaceNavigator.axes[this.data.axisMap[1]],
          zDelta = this.data.axisMultiply *  spaceNavigator.axes[this.data.axisMap[2]]
          
      velocity.x += xDelta * acceleration * dt / 1000
      velocity.z += zDelta * acceleration * dt / 1000
      velocity.y -= yDelta * acceleration * dt / 1000
    }

    var movementVector = this.getMovementVector(dt);
    
    this.movement.copy(movementVector)
    this.position.add(movementVector)

    if (el) {
      el.object3D.position.copy(this.position)
      el.setAttribute('position', {
        x: this.position.x,
        y: this.position.y,
        z: this.position.z
      });
    }

  },
  
  getBiggestAxis: function(nav) {
      var biggest = -1
      var axis = 0
      for (var i=0; i<nav.axes.length; i++) {
          a = Math.abs(nav.axes[i])
          if (a>biggest) {
              axis = i
              biggest = a
          }
      }
      return axis
  },

  getMovementVector: function (dt) {
    if (this._getMovementVector) return this._getMovementVector(dt)

    var euler = new THREE.Euler(0, 0, 0, 'YXZ'),
        rotation = new THREE.Quaternion(),
        direction = this.movementDirection,
        velocity = this.movementVelocity

    this._getMovementVector = function (dt) {
      if (this.el) {
        rotation.copy( this.el.getAttribute('rotation') )
      } else {
        rotation.copy( this.rotation )
      }

      direction.copy(velocity)
      direction.multiplyScalar(dt / 1000)
      if (!rotation) return direction
      direction.applyQuaternion(rotation)
      return direction
    }

    return this._getMovementVector(dt)
  },

  quaternionDistanceSq: function(a,b) {
      return Math.pow(a.x-b.x,2)+Math.pow(a.y-b.y,2)+Math.pow(a.z-b.z,2)+Math.pow(a.w-b.w,2)
  },
  
  /*******************************************************************
   * Rotation
   */

  updateRotation: function () {
    if (this._updateRotation) return this._updateRotation();

    var initialRotation = new THREE.Quaternion(),
        prevInitialRotation = new THREE.Quaternion(),
        prevFinalRotation = new THREE.Quaternion();

    var tCurrent,
        tLastLocalActivity = 0,
        tLastExternalActivity = 0;

    var rotationEps = 0.0001,
        debounce = 500;

    this._updateRotation = function () {

      var spaceNavigator = this.getSpaceNavigator()
      
      if (!this.data.lookEnabled || !spaceNavigator) return;
      
      tCurrent = Date.now();
      if (this.el) {
        initialRotation.copy(this.el.getAttribute('rotation') || initialRotation)
      } else {
        initialRotation.copy(this.rotation)
      }

      // If initial rotation for this frame is different from last frame, and
      // doesn't match last spaceNavigator state, assume an external component is
      // active on this element.
      /* TODO: FIX:
        if (//this.quaternionDistanceSq(initialRotation,prevInitialRotation) > rotationEps ||
          this.quaternionDistanceSq(initialRotation,prevFinalRotation) > rotationEps) {
        //prevInitialRotation.copy(initialRotation);
        prevFinalRotation.copy(initialRotation)
        tLastExternalActivity = tCurrent;
        return;
      } */

      prevInitialRotation.copy(initialRotation);

      // If external controls have been active in last 500ms, wait.
      if (tCurrent - tLastExternalActivity < debounce) return

      /*
       * 3dconnexion space navigator rotation axes
       *
       * "right handed coordinate system"
       * 3: - pitch down / + pitch up (rot: X axis clock wise)
       * 4: - roll right / + roll left (rot: Z axis clock wise)
       * 5: - yaw right / + yaw left (rot: Y axis clock wise)
       */

      var delta = new THREE.Vector3(this.data.axisMultiply * spaceNavigator.axes[this.data.axisMap[3]], 
							this.data.axisMultiply * spaceNavigator.axes[this.data.axisMap[4]], 
							this.data.axisMultiply * spaceNavigator.axes[this.data.axisMap[5]])

      //console.log(delta)
      if (delta.x < ROTATION_EPS && delta.x > -ROTATION_EPS) delta.z = 0
      if (delta.y < ROTATION_EPS && delta.y > -ROTATION_EPS) delta.y = 0
      if (delta.z < ROTATION_EPS && delta.z > -ROTATION_EPS) delta.x = 0

      if (this.data.invertPitch) delta.x *= -delta.x
      
      if (!this.data.rollEnabled) delta.z = 0
      
      // If external controls have been active more recently than spaceNavigator,
      // and spaceNavigator hasn't moved, don't overwrite the existing rotation.
      if (tLastExternalActivity > tLastLocalActivity && !delta.lengthSq()) return

      delta.multiplyScalar(this.data.rotationSensitivity)

      var q = new THREE.Quaternion()
      q.setFromEuler(new THREE.Euler(delta.x,delta.y,delta.z))
      
      this.rotation.multiply(q)

      if (this.el) {
        this.el.setAttribute('rotation', rotation)
        prevFinalRotation.copy(this.el.getAttribute('rotation'))
      } else {
        prevFinalRotation.copy(this.rotation)
      }

      tLastLocalActivity = tCurrent;
    };

    return this._updateRotation();
  },

  updateFov: function (dt) {
    if (this._updateFov) return this._updateFov(dt)

    var self = this
    var previousScroll = 0

    this._updateFov = function (dt) {
      var fovFromAttribute = self.el ? self.el.getAttribute('fov') : null
      var fov = fovFromAttribute ? parseFloat(fovFromAttribute) : self.fov
      var lensDistance = 1 / Math.tan(fov / 2 * DEG_TO_RAD)
      // easing
      if (dt > 1000) return
      self.fovVelocity = self.fovVelocity - self.fovVelocity * dt / 1000 * self.data.fovEasing
      if (self.fovVelocity > -0.001 && self.fovVelocity < 0.001) self.fovVelocity = 0
      // acceleration
      var scrollDelta = previousScroll - self.scroll
      self.fovVelocity += scrollDelta * dt / 1000 * self.data.fovAcceleration
      // applay
      var newLensDistance = lensDistance + self.fovVelocity * self.data.fovSensitivity
      //var newFov = Math.min(140, Math.max(10, Math.atan( 1 / newLensDistance ) * 2))
      fov = Math.atan(1 / newLensDistance) * 2 * RAD_TO_DEG
      if (fov > self.data.fovMin && fov < self.data.fovMax) {
        if (self.el) self.el.setAttribute('fov', fov)
        self.fov = fov
      }
      previousScroll = self.scroll

    }

    return this._updateFov(dt)
  },
  
  getButton: function(i) {
    return !!this.buttons[i]
  },

  /*******************************************************************
   * Button events
   */

  updateButtonState: function () {
    var spaceNavigator = this.getSpaceNavigator();
    if (this.data.enabled && spaceNavigator) {

      // Fire DOM events for button state changes.
      for (var i = 0; i < spaceNavigator.buttons.length; i++) {
        if (spaceNavigator.buttons[i].pressed && !this.buttons[i]) {
            var e = new Event('navigatorbuttondown')
            e.index = i
            e.down = true
            window.dispatchEvent(e)
            this.buttons[i] = true
            this.releaseDebounceCount[i] = 0
        } else if (!spaceNavigator.buttons[i].pressed && this.buttons[i]) {
            if (this.releaseDebounceCount[i] >= this.data.releaseDebounceCount) {
                var e = new Event('navigatorbuttonup')
                e.index = i
                e.down = false
                window.dispatchEvent(e)
                this.releaseDebounceCount[i] = 0
                this.buttons[i] = false
            }
            else {
                if (!this.releaseDebounceCount[i])
                    this.releaseDebounceCount[i] = 1
                else
                    this.releaseDebounceCount[i]++
            }
        }
      }

    } else if (Object.keys(this.buttons)) {
      // Reset state if controls are disabled or controller is lost.
      this.buttons = {};
    }
  },

  /*******************************************************************
   * SpaceNavigator state
   */

  /**
   * Returns SpaceNavigator instance attached to the component. If connected,
   * a proxy-controls component may provide access to spaceNavigator input from a
   * remote device.
   *
   * @return {SpaceNavigator}
   */
  getSpaceNavigator: function () {

    var this_ = this
    var proxyControls = this.el ? this.el.sceneEl.components['proxy-controls'] : null

    if (proxyControls) {

      // use proxy space navigator
      return proxyControls && proxyControls.isConnected() && proxyControls.getSpaceNavigator()

    } else {
      // use local space navigator

      if (!navigator.getGamepads) {
        console.error('Gamepad API is not supported on this browser. Please use Firefox or Chrome.')
        return false
      }

      if (this.spaceNavigatorId === undefined || navigator.getGamepads()[this.spaceNavigatorId] === null ) {
        // find space navigator
        var gamepadList = navigator.getGamepads()
        Object.keys(gamepadList).forEach(function(i){
          var gamepadName = gamepadList[i] ? gamepadList[i].id : null
          if (gamepadName &&
            (
              gamepadName.toLowerCase().indexOf('spacenavigator') > -1
              || gamepadName.toLowerCase().indexOf('space navigator') > -1
              || gamepadName.toLowerCase().indexOf('spacemouse') > -1
              || gamepadName.toLowerCase().indexOf('space mouse') > -1
              || (gamepadName.toLowerCase().indexOf('vendor: 046d') > -1 && gamepadName.toLowerCase().indexOf('product: c6'))
            ) 
          ) {
            this_.spaceNavigatorId = i
          }
        })
      }

	  var nav
      if (this.spaceNavigatorId === undefined || (nav = navigator.getGamepads()[this.spaceNavigatorId]) === null ) {
          this.message("SpaceMouse not found. Plug it in and press some buttons.")
		  return undefined
      }
	  this.message("SpaceMouse connected.")
	  
      return nav

    }
  },

  /**
   * Returns true if Space Navigator is currently connected to the system.
   * @return {boolean}
   */
  isConnected: function () {
    var spaceNavigator = this.getSpaceNavigator();
    return !!(spaceNavigator && spaceNavigator.connected);
  },

  /**
   * Returns a string containing some information about the controller. Result
   * may vary across browsers, for a given controller.
   * @return {string}
   */
  getID: function () {
    return this.getSpaceNavigator().id;
  }

}

// helpers

function ButtonEvent (type, index, details) {
  this.type = type;
  this.index = index;
  this.pressed = details.pressed;
  this.value = details.value;
}

// performance now polyfill
// inspired by: https://gist.github.com/paulirish/5438650
if (!window.performance) {
  window.performance = {}
}
if (!window.performance.now){
  var navigationStart = performance.timing ? performance.timing.navigationStart : null
  var nowOffset = navigationStart || Date.now()
  window.performance.now = function now(){
    return Date.now() - nowOffset
  }
}

if (window.THREE) {
  var SpaceNavigatorControls = function SpaceNavigatorControls(args) {

    args = args || {}
    var this_ = this

    this_.data = {}
    Object.keys(this_.schema).forEach(function(argName){
      if (args[argName] !== undefined) {
        // use argument
        this_.data[argName] = args[argName]
      } else {
        // set default
        this_.data[argName] = this_.schema[argName].default
      }
    })
    
    this_.init()

  }
  SpaceNavigatorControls.prototype = SpaceNavigator

  window.THREE.SpaceNavigatorControls = SpaceNavigatorControls
}
