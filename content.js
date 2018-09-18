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

      var xDelta = spaceNavigator.axes[0],
          yDelta = -spaceNavigator.axes[2],
          zDelta = spaceNavigator.axes[1]
          
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

      var delta = new THREE.Vector3(spaceNavigator.axes[3], spaceNavigator.axes[5], spaceNavigator.axes[4])

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

      if (this.spaceNavigatorId === undefined ||  navigator.getGamepads()[this.spaceNavigatorId] === null ) {
          this.message("SpaceMouse not found. Plug it in and press some buttons.")
      }
      else {
          this.message("SpaceMouse connected.")
      }
      return navigator.getGamepads()[this.spaceNavigatorId]

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

var tinkerCADPatch = {
    EPS_SQUARED: Math.pow(1e-3,2),
    BASE_ACCELERATION: 700,
    ALWAYS_MOVE: false,
    lastModelAxis: -1,
    NUDGE_THRESHOLD_ON: 0.3,
    NUDGE_THRESHOLD_OFF: 0.2,
    nextMovementTime: -10000,
    FIRST_REPEAT: 250,
    NEXT_REPEAT: 75,
	FRAME_TIME: 33,
    nudging: false,

    getCamera: function() {
        return tcApp._editor3DContent._editor3DModel.submodel._content.Navigating.val.navigation.getCamera()
    },
    
    getSelectedModels: function() {
        var models = tcApp._editor3DContent._editor3DStateMachine.selection.objects._content
        //tcApp._editor3DContent._editor3DModel.uiLayoutView.selectionModel.selection._content
        selected = []
        for (p in models) 
            selected.push(models[p].val)
        return selected
    },
    
    syncCamera: function() {
        tcApp._editor3DContent._editor3DModel.submodel._content.Navigating.val.syncCamera()
    },
    
    updateFromCamera: function(cam) {
        var _this = tinkerCADPatch
        var prev = _this.prev
        
        if (prev.position && cam.position.distanceToSquared( prev.position ) <= _this.EPS_SQUARED &&
            prev.target && cam.target.distanceToSquared( prev.target ) <= _this.EPS_SQUARED &&
            prev.up && cam.up.distanceToSquared( prev.up ) > _this.EPS_SQUARED)
            return false;
            
        var controls = _this.controls
        
        prev.position.copy(cam.position)
        prev.target.copy(cam.target)
        prev.up.copy(cam.up)
 
        var lookNorm = cam.target.clone()
        lookNorm.sub(prev.position)
        prev.distance = lookNorm.length()
        if (prev.distance>0)
            lookNorm.multiplyScalar(1/prev.distance)
        
        var upNorm = prev.up.clone()
        upNorm.normalize()
        
        var upCrossLook = upNorm.clone()
        upCrossLook.cross(lookNorm)
        
        var m = new THREE.Matrix4()
        m.set(upCrossLook.x, upNorm.x, lookNorm.x, 0,
              upCrossLook.y, upNorm.y, lookNorm.y, 0,
              upCrossLook.z, upNorm.z, lookNorm.z, 0,
              0, 0, 0, 1)
        
        controls.data.movementAcceleration = _this.BASE_ACCELERATION * prev.distance/254.6
        controls.rotation.setFromRotationMatrix(m)
        controls.position.copy(prev.target)
        
        return true
    },
    
    updateToCamera: function(cam) {
        var _this = tinkerCADPatch
        cam.target.copy(_this.controls.position)
        var look = new THREE.Vector3(0,0,1)
        look.applyQuaternion(_this.controls.rotation)
        look.multiplyScalar(_this.prev.distance)
        cam.position.subVectors(cam.target, look)
        cam.up.set(0,1,0)
        cam.up.applyQuaternion(_this.controls.rotation)
        return cam.position.distanceToSquared(_this.prev.position) >= _this.EPS_SQUARED ||
               cam.target.distanceToSquared(_this.prev.target) >= _this.EPS_SQUARED ||
               cam.up.distanceToSquared(_this.prev.up) >= _this.EPS_SQUARED
    },
    
    getCenter: function(models) {
        if (! models.length)
            return new THREE.Vector3(0,0,0)
        var minimum = [Infinity,Infinity,Infinity]
        var maximum = [-Infinity,-Infinity,-Infinity]
        var p = new THREE.Vector3()
        var m = new THREE.Matrix4()
        for (var i=0; i<models.length; i++) {
            models[i].geometry.value.computeBoundingSphere()
            c = models[i].geometry.value.boundingSphere.center
            p.copy(c)
            m.fromArray(models[i].data.matrix.get())
            p.applyMatrix4(m)
            pp = [p.x,p.y,p.z]
            for (var j=0; j<3; j++) {
                if (pp[j] < minimum[j])
                    minimum[j] = pp[j]
                if (pp[j] > maximum[j])
                    maximum[j] = pp[j]
            }
        }
        return new THREE.Vector3(0.5*(minimum[0]+maximum[0]),0.5*(minimum[1]+maximum[1]),0.5*(minimum[2]+maximum[2]))            
    },
    
    stopNudging: function() {
        var _this = tinkerCADPatch
        if (_this.nudging) {
            tcApp._editor3DContent._editor3D.root.stopRec()
            _this.nudging = false
            tcApp._editor3DContent._editor3DModel.uiLayoutView.selectionBB.update()
        }        
    },
    
    moveModels: function(models) {
        var _this = tinkerCADPatch
        var snap = tcApp._editor3DContent._editor3DModel.submodel._content.Navigating.val.workplane.snap.value
        var nav = _this.controls.getSpaceNavigator()
        if (!nav)
            return 
        axis = _this.controls.getBiggestAxis(nav)
        v = nav.axes[axis]
        if ( Math.abs(v) < (_this.lastModelAxis == axis ? _this.NUDGE_THRESHOLD_OFF : _this.NUDGE_THRESHOLD_ON) ) {
            _this.lastModelAxis = -1
            _this.stopNudging()
            return
        }
        if (_this.lastModelAxis == axis) {
            if (performance.now() < _this.nextMovementTime || _this.NEXT_REPEAT == 0)
                return            
            else
                _this.nextMovementTime = performance.now() + _this.NEXT_REPEAT
        }
        else {
            _this.nextMovementTime = performance.now() + _this.FIRST_REPEAT
            _this.lastModelAxis = axis
        }
        var s = Math.sign(v)
        var m = new THREE.Matrix4()

        if (! _this.nudging) {
            _this.nudging = true
            tcApp._editor3DContent._editor3D.root.rec()
        }
        if (axis < 3) {
            if (axis==1) {
                var testVector = new THREE.Vector3(0,0,1)
                testVector.applyQuaternion(_this.controls.rotation)
                if (testVector.y < 0)
                    s = -s
                m.set(1, 0, 0, 0,
                      0, 1, 0, 0,
                      0, 0, 1, snap * s, 
                      0, 0, 0, 1)
            }
            else {
                var testVector = new THREE.Vector3()
                if (axis == 0)
                    testVector.x = s
                else
                    testVector.y = s

                testVector.applyQuaternion(_this.controls.rotation)
                
                if (Math.abs(testVector.x) < Math.abs(testVector.y)) {
                    moveAxis = 1
                    sign = -Math.sign(testVector.y)
                }
                else {
                    moveAxis = 0
                    sign = -Math.sign(testVector.x)
                }

                if (moveAxis == 0)
                    m.set(1, 0, 0, sign * snap,
                          0, 1, 0, 0,
                          0, 0, 1, 0,
                          0, 0, 0, 1)
                else
                    m.set(1, 0, 0, 0,
                          0, 1, 0, sign * snap,
                          0, 0, 1, 0,
                          0, 0, 0, 1)                
            }
            
            for (var i=0;i<models.length;i++) {
                models[i].applyMatrix(m)
            }
        }            
        else {
           var r = new THREE.Matrix4()
            if (axis == 3) {
                // x
                var testVector = new THREE.Vector3(1,0,0)
                testVector.applyQuaternion(_this.controls.rotation)
                if (testVector.x < 0)
                    s = -s
                var angle = -s * Math.PI / 8
                r.makeRotationX(angle)
            }
            else if (axis == 4) {
                // z
                var testVector = new THREE.Vector3(0,0,1)
                testVector.applyQuaternion(_this.controls.rotation)
                if (testVector.y < 0)
                    s = -s
                var angle = s * Math.PI / 8
                r.makeRotationZ(angle)
            }
            else {
                // y
                var testVector = new THREE.Vector3(0,1,0)
                testVector.applyQuaternion(_this.controls.rotation)
                if (testVector.y < 0)
                    s = -s
                var angle = -s * Math.PI / 8
                r.makeRotationY(angle)
            }

            // todo: cleanup
            var center = _this.getCenter(models)
            var centerMatrix = new THREE.Matrix4()
            centerMatrix.makeTranslation(center.x,center.y,center.z)
            var ncenterMatrix = new THREE.Matrix4()
            ncenterMatrix.makeTranslation(-center.x,-center.y,-center.z)
            
            for (var i=0; i<models.length; i++) {
                models[i].applyMatrix(ncenterMatrix)
                models[i].applyMatrix(r)
                models[i].applyMatrix(centerMatrix)
            }
        }
    },

    update: function() {
        var _this = tinkerCADPatch
        var cam = tinkerCADPatch.getCamera()
        _this.updateFromCamera(cam)
        var movementOnly = _this.keys[16] || _this.controls.getButton(1) // shift
        var rotationOnly = _this.keys[17] || _this.controls.getButton(2) // control
        var selected = _this.getSelectedModels()
        if (_this.ALWAYS_MOVE || movementOnly || rotationOnly || selected.length == 0 || tcApp._editor3DContent._editor3DModel.submodel._content.Navigating.val.workplane.snap.value == 0) {
            _this.stopNudging()
            _this.lastModelAxis = -1
            _this.controls.update(updateMovement=!rotationOnly,updateRotation=!movementOnly)
            if (_this.updateToCamera(cam)) {
                _this.prev.position.copy(cam.position)
                _this.prev.target.copy(cam.target)
                _this.prev.up.copy(cam.up)
                _this.syncCamera()
            }
        }
        else if (selected.length > 0) {
            _this.controls.update(updateMovement=false,updateRotation=false)
            _this.moveModels(selected)
        }
    },
    
    multiIn: function(property, object) {
        var parts = property.split(".")
        for (var i = 0 ; i < parts.length ; i++) {
            if (typeof object == "undefined")
                return false
            if (! (parts[i] in object))
                return false
            object = object[parts[i]]
        }
        return true
    },
    
    ready: function() {
        state = 
            typeof window != "undefined" &&
            tinkerCADPatch.multiIn("tcApp._editor3DContent._editor3DModel.submodel._content.Navigating.val.navigation.getCamera", window) &&
            tinkerCADPatch.multiIn("tcApp._editor3DContent._editor3DModel.submodel._content.Navigating.val.syncCamera", window) &&
            typeof tinkerCADPatch.getCamera() != "undefined"
        return state
    },
    
    _init: function() {
        var _this = tinkerCADPatch

		opts = JSON.parse(document.getElementById('tinkerCADPatch_SpaceMouse').getAttribute('data-options'))
		if (opts.fps != undefined && 1 <= opts.fps && opts.fps <= 120)
			_this.frameTime = 1000 / opts.fps
		if (opts.nudgeFirstRepeat != undefined)
			_this.FIRST_REPEAT = parseFloat(opts.nudgeFirstRepeat)
		if (opts.nudgeNextRepeat != undefined)
			_this.NEXT_REPEAT = parseFloat(opts.nudgeNextRepeat)
		if (opts.nudgeAxis != undefined)
			_this.NUDGE_THRESHOLD_ON = parseFloat(opts.nudgeAxis)
		if (opts.nudgeHysteresisRatio != undefined)
			_this.NUDGE_THRESHOLD_OFF = _this.NUDGE_THRESHOLD_OFF * opts.nudgeHysteresisRatio

        _this.prev = { 
            position: new THREE.Vector3(),
            look: new THREE.Vector3(),
            up: new THREE.Vector3(),
            target: new THREE.Vector3(),
            lookNorm: new THREE.Vector3(1,0,0),
            distance: 254.6
            }        
            
        _this.keys = {}
        _this.old_onkeyup = window.onkeyup
        _this.old_onkeydown = window.onkeydown
        window.addEventListener('keyup', function(e) { tinkerCADPatch.keys[e.keyCode] = false })
        window.addEventListener('keydown', function(e) { tinkerCADPatch.keys[e.keyCode] = true })
        window.addEventListener('navigatorbuttondown', function(e) { if (e.index == 3) tcApp._editor3DContent.fitToView() })
        
        new iqwerty.toast.Toast("SpaceMouse support code injected into TinkerCAD");

        _this.controls = new THREE.SpaceNavigatorControls()
        _this.controls.init()
        _this.updateFromCamera(_this.getCamera())        
		
        setInterval(_this.update, _this.frameTime)
    },

    init: function() {
        var _this = tinkerCADPatch
        
        if (!_this.ready()) {
            setTimeout(_this.init, 500)
            return
        }
		
		// give it a bit more time in case TinkerCAD needs to do more setup
		setTimeout(_this._init, 500)
    }
}

tinkerCADPatch.init()
