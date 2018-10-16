(function(){
    var EPS_SQUARED = Math.pow(1e-3,2)
    var BASE_ACCELERATION = 700
    var ALWAYS_MOVE = false
    var NUDGE_THRESHOLD_ON = 0.3
    var NUDGE_THRESHOLD_OFF = 0.2
    var FIRST_REPEAT = 250
    var NEXT_REPEAT = 75
	var FRAME_TIME = 33
	var NUDGE_ANGLE = Math.PI / 8
	var flyMode = false
	var navigateRotationally = "2"
	var navigatePositionally = "1"
	var navigateSelection = "3"
	var home = "5"
	var fit = "4"
	var fineRotation = "9"
    
    var lastModelAxis = -1
    var nextMovementTime = -10000
    var nudging = false
    var last = {}
    var keys = {}
    var controls
	var focused = true
	
	function checkControl(c) {
		if (c == "none")
			return false
		else if (! isNaN(c)) 
			return controls.getButton(parseInt(c))
		else 
			return false // TODO: handle common keys
	}

	function checkControlButton(c,i) {
		if (c == "none")
			return false
		else if (! isNaN(c)) 
			return parseInt(c) == i
		else 
			return false // TODO: handle common keys
	}

    function getCamera() {
        return tcApp._editor3DContent._editor3DModel.submodel._content.Navigating.val.navigation.getCamera()
    }
    
    function getSelectedModels() {
        var models = tcApp._editor3DContent._editor3DStateMachine.selection.objects._content
        //tcApp._editor3DContent._editor3DModel.uiLayoutView.selectionModel.selection._content
        selected = []
        for (p in models) 
            selected.push(models[p].val)
        return selected
    }
    
    function syncCamera() {
        tcApp._editor3DContent._editor3DModel.submodel._content.Navigating.val.syncCamera()
    }
    
    function updateFromCamera(cam) {
        if (last.position && cam.position.distanceToSquared( last.position ) <= EPS_SQUARED &&
            last.target && cam.target.distanceToSquared( last.target ) <= EPS_SQUARED &&
            last.up && cam.up.distanceToSquared( last.up ) > EPS_SQUARED)
            return false;
            
        last.position.copy(cam.position)
        last.target.copy(cam.target)
        last.up.copy(cam.up)
 
        var lookNorm = cam.target.clone()
        lookNorm.sub(last.position)
        last.distance = lookNorm.length()
        if (last.distance>0)
            lookNorm.multiplyScalar(1/last.distance)
        
        var upNorm = last.up.clone()
        upNorm.normalize()
        
        var upCrossLook = upNorm.clone()
        upCrossLook.cross(lookNorm)
        
        var m = new THREE.Matrix4()
        m.set(upCrossLook.x, upNorm.x, lookNorm.x, 0,
              upCrossLook.y, upNorm.y, lookNorm.y, 0,
              upCrossLook.z, upNorm.z, lookNorm.z, 0,
              0, 0, 0, 1)
        
        controls.data.movementAcceleration = BASE_ACCELERATION * last.distance/254.6
        controls.rotation.setFromRotationMatrix(m)
        controls.position.copy(last.target)
        
        return true
    }
    
    function updateToCamera(cam) {
        cam.target.copy(controls.position)
        var look = new THREE.Vector3(0,0,1)
        look.applyQuaternion(controls.rotation)
        look.multiplyScalar(last.distance)
        cam.position.subVectors(cam.target, look)
        cam.up.set(0,1,0)
        cam.up.applyQuaternion(controls.rotation)
        return cam.position.distanceToSquared(last.position) >= EPS_SQUARED ||
               cam.target.distanceToSquared(last.target) >= EPS_SQUARED ||
               cam.up.distanceToSquared(last.up) >= EPS_SQUARED
    }
    
    function getCenter(models) {
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
    }
    
    function stopNudging() {
        if (nudging) {
            tcApp._editor3DContent._editor3D.root.stopRec()
            nudging = false
            tcApp._editor3DContent._editor3DModel.uiLayoutView.selectionBB.update()
        }        
    }
    
    function moveModels(models) {
        var snap = tcApp._editor3DContent._editor3DModel.submodel._content.Navigating.val.workplane.snap.value
		if (snap == 0)
			snap = 0.1		
		var nudgeAngle = NUDGE_ANGLE
		if (checkControl(fineNudge)) {			
			snap /= 10
			if (nudgeAngle <= 1)
				nudgeAngle /= 10
			else
				nudgeAngle = 1
		}
		
        var nav = controls.getSpaceNavigator()
        if (!nav)
            return 
        axis = controls.getDominantAxis(nav.axes)
		if (axis < 0) {
            lastModelAxis = -1
            stopNudging()
            return
		}
        v = nav.axes[axis]
        if ( Math.abs(v) < (lastModelAxis == axis ? NUDGE_THRESHOLD_OFF : NUDGE_THRESHOLD_ON) ) {
            lastModelAxis = -1
            stopNudging()
            return
        }
        if (lastModelAxis == axis) {
            if (performance.now() < nextMovementTime || NEXT_REPEAT == 0)
                return            
            else
                nextMovementTime = performance.now() + NEXT_REPEAT
        }
        else {
            nextMovementTime = performance.now() + FIRST_REPEAT
            lastModelAxis = axis
        }
        var s = Math.sign(v)
        var m = new THREE.Matrix4()

        if (! nudging) {
            nudging = true
            tcApp._editor3DContent._editor3D.root.rec()
        }
		
        if (axis < 3) {
            if (axis==2) {
                var testVector = new THREE.Vector3(0,0,1)
                testVector.applyQuaternion(controls.rotation)
                if (testVector.z < 0)
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

                testVector.applyQuaternion(controls.rotation)
                
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
                testVector.applyQuaternion(controls.rotation)
                if (testVector.x < 0)
                    s = -s
                var angle = -s * nudgeAngle
                r.makeRotationX(angle)
            }
            else if (axis == 4) {
                // y
                var testVector = new THREE.Vector3(0,1,0)
                testVector.applyQuaternion(controls.rotation)
                if (testVector.y < 0)
                    s = -s
                var angle = -s * nudgeAngle
                r.makeRotationY(angle)
            }
            else {
                // z
                var testVector = new THREE.Vector3(0,0,1)
                testVector.applyQuaternion(controls.rotation)
                if (testVector.y < 0)
                    s = -s
                var angle = -s * nudgeAngle
                r.makeRotationZ(angle)
            }

            // todo: cleanup
            var center = getCenter(models)
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
    }

    function update() {
		if (! focused)
			return
        var cam = getCamera()
        updateFromCamera(cam)
        var movementOnly = keys[16] || checkControl(navigatePositionally) // shift
        var rotationOnly = keys[17] || checkControl(navigateRotationally) // control
		var allowMove = checkControl(navigateSelection)  // always move
        var selected = getSelectedModels()
        if (ALWAYS_MOVE || allowMove || movementOnly || rotationOnly || selected.length == 0) {
            stopNudging()
            lastModelAxis = -1
            controls.update(updateMovement=!rotationOnly,updateRotation=!movementOnly)
            if (updateToCamera(cam)) {
                last.position.copy(cam.position)
                last.target.copy(cam.target)
                last.up.copy(cam.up)
                syncCamera()
            }
        }
        else if (selected.length > 0) {
            controls.update(updateMovement=false,updateRotation=false)
            moveModels(selected)
        }
    }
    
    function multiIn(property, object) {
        var parts = property.split(".")
        for (var i = 0 ; i < parts.length ; i++) {
            if (typeof object == "undefined")
                return false
            if (! (parts[i] in object))
                return false
            object = object[parts[i]]
        }
        return true
    }
    
    function ready() {
        var state = 
            typeof window != "undefined" &&
            multiIn("tcApp._editor3DContent._editor3DModel.submodel._content.Navigating.val.navigation.getCamera", window) &&
            multiIn("tcApp._editor3DContent._editor3DModel.submodel._content.Navigating.val.syncCamera", window) &&
            typeof getCamera() != "undefined"
        return state
    }
    
    function _init() {
        controls = new THREE.SpaceNavigatorControls()

		var opts = JSON.parse(document.getElementById('tinkerCADPatch_SpaceMouse').getAttribute('data-options'))
		if (opts.fps != undefined && 1 <= opts.fps && opts.fps <= 120)
			frameTime = 1000 / opts.fps
		if (opts.nudgeFirstRepeat != undefined)
			FIRST_REPEAT = parseFloat(opts.nudgeFirstRepeat)
		if (opts.nudgeNextRepeat != undefined)
			NEXT_REPEAT = parseFloat(opts.nudgeNextRepeat)
		if (opts.nudgeAxis != undefined)
			NUDGE_THRESHOLD_ON = parseFloat(opts.nudgeAxis)
		if (opts.nudgeHysteresisRatio != undefined)
			NUDGE_THRESHOLD_OFF = NUDGE_THRESHOLD_ON * opts.nudgeHysteresisRatio
		if (opts.nudgeAngle != undefined) 
			NUDGE_ANGLE = opts.nudgeAngle / 180. * Math.PI
		if (opts.fly) 
			controls.data.axisMultiply = [-1,-1,-1,-1,-1,-1]
		else
			controls.data.axisMultiply = [1,1,1,1,1,1]
		if (opts.swapYZ === undefined || opts.swapYZ) {
			controls.data.axisMap = [0,2,1,3,5,4]
			if (opts.fly)
				controls.data.axisMultiply[1] = -controls.data.axisMultiply[1]
		}
		else {
			controls.data.axisMap = [0,1,2,3,4,5]
		}
		if (opts.navPositionally != undefined)
			navigatePositionally = opts.navPositionally
		if (opts.navRotationally != undefined)
			navigateRotationally = opts.navRotationally
		if (opts.navSelection != undefined)
			navigateSelection = opts.navSelection
		if (opts.fineNudge != undefined)
			fineNudge = opts.fineNudge
		if (opts.fit != undefined)
			fit = opts.fit
		if (opts.home != undefined)
			home = opts.home
		if (opts.rotationSpeedMultiplier != undefined) 
			controls.data.rotationSensitivity = 1.5 * opts.rotationSpeedMultiplier
		if (opts.dominantAxis != undefined)
			controls.data.dominantAxis = opts.dominantAxis
		if (opts.requiredDominationAngle != undefined)
			controls.data.requiredDominationAngle = opts.requiredDominationAngle
		if (opts.generic) {
			controls.data.genericJoystick = true
			controls.data.axisPreMap = [parseInt(opts.translateX),parseInt(opts.translateY),parseInt(opts.translateZ),
										parseInt(opts.rotateX),parseInt(opts.rotateY),parseInt(opts.rotateZ)]
			var invs = [opts.translateXInvert, opts.translateYInvert, opts.translateZInvert, 
						opts.rotateXInvert, opts.rotateYInvert, opts.rotateZInvert ]
			for (var i=0;i<6;i++)
				controls.data.axisPreMultiply[i] = invs[i] ? -1  : 1
		}
		else {
			controls.data.genericJoystick = false
		}
			
        last = { 
            position: new THREE.Vector3(),
            look: new THREE.Vector3(),
            up: new THREE.Vector3(),
            target: new THREE.Vector3(),
            lookNorm: new THREE.Vector3(1,0,0),
            distance: 254.6
        }        
            
        window.onblur = function(e) { focused = false }
        window.onfocus = function(e) { focused = true }
        document.addEventListener('keyup', function(e) { keys[e.keyCode] = false })
        document.addEventListener('keydown', function(e) { keys[e.keyCode] = true })
        window.addEventListener('navigatorbuttondown', function(e) { 
			if (checkControlButton(fit, e.index)) tcApp._editor3DContent._editor3DModel.submodel._content.Navigating.val.fitView()
			else if (checkControlButton(home, e.index)) tcApp._editor3DContent._editor3DModel.submodel._content.Navigating.val.goHomeView()
		})
        
        new iqwerty.toast.Toast("SpaceMouse support code injected into TinkerCAD");

        controls.init()
        updateFromCamera(getCamera())        
		
        setInterval(update, frameTime)
    }

    function init() {
        if (!ready()) {
            setTimeout(init, 500)
            return
        }
		
		// give it a bit more time in case TinkerCAD needs to do more setup
		setTimeout(_init, 500)
    }
    
    init()
})()
