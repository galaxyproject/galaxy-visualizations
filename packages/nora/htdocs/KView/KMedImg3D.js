

var oldBablyonFlag = false;

/** @class 
*/
function KMedImg3D(medviewer,$canvas3D)
{
	



	$canvas3D.show();

  
	var viewer = medviewer;
	var engine = new BABYLON.Engine($canvas3D[0], true,{preserveDrawingBuffer: true}  );

    setQuality();
	var scene;
	var camera;
	var camera_picto;
	var control;
	var planes = [];
	var grandParent ;
	var posIndicator;
	var flip;

	var vol_planes = [];
	var vol_textures = [];
	var vol_materials = [];
	var vol_ctxs = [];
	
	var currentLayout;
	var psz = [];
	var textures = [];
	var materials = [];
	var pencil;
	var ctxs = [];
    var center;
    var texSize = 1024;
    var _this = this;
    var planesVisibility = [true,true,true];
	
	function setPlanesVisibility(pp)
	{
		planesVisibility = pp;
		updateObjects();
	}

	function getPlanesVisibility()
	{
		return planesVisibility;
	}


    var fixedPlanarView = -1;


    var helperMesh;




	function createCutSurfShader(obj)
	{
			var shader = new BABYLON.ShaderMaterial("mySurfcolShader", scene, "mySurfcol", {
					attributes: [BABYLON.VertexBuffer.PositionKind,BABYLON.VertexBuffer.NormalKind,'color'],
					uniforms: ["worldViewProjection","planesPos","planesThres","planesCut","worldToVoxel"],
					needAlphaBlending: (obj.alpha<1),
					needAlphaTesting: (obj.alpha<1)	
				});		

			shader.shadersignal = signalhandler.attach('positionChange', function() {
				var pp = world2GL(viewer.getWorldPosition());
				var planesPos = new BABYLON.Vector3(pp[0],pp[1],pp[2]);
				shader.setVector3("planesPos",planesPos);
				shader.updateTilts();
			});
			shader.alphaMode = obj.alphaMode;
			shader.wireframe = obj.wire;;
			shader.backFaceCulling = false;
			if (parseFloat(obj.beltwidth) > 0)
                shader.setFloat("planesThres",parseFloat(obj.beltwidth));
			else
			{
				if (obj.cuts != undefined && obj.cuts[0] == 0 && obj.cuts[1] == 0 && obj.cuts[2] == 0)
					shader.setFloat("planesThres",10000);
				else
					shader.setFloat("planesThres",0);
			}
	  		var perm = [viewer.nii.permutationOrder[1],viewer.nii.permutationOrder[2],viewer.nii.permutationOrder[0]];

			shader.setVector3("planesCut",new BABYLON.Vector3(obj.cuts[perm[0]],obj.cuts[perm[1]],obj.cuts[perm[2]]));
			shader.setFloat('alpha',obj.alpha);
			shader.setFloat('vertexcoloring',0)



			return shader;
	}

/*
					needDepthPrePass: true	,
					separateCullingPass:true			
*/

	function createFiberShader()
	{
		    var needAlphaBlending =false;
		    if (state.viewer.fiberAlpha)
		    	needAlphaBlending = true;
			/////////// the fibershader instance
			var fiberDirColor_shader = new BABYLON.ShaderMaterial("fiberColorShader", scene, "fiberColor", {
					attributes: [BABYLON.VertexBuffer.PositionKind,'colors'],
					uniforms: ["worldViewProjection","col"],
					needAlphaBlending: needAlphaBlending,
				});
			fiberDirColor_shader.shadersignal = signalhandler.attach('positionChange', function() {
				var pp = world2GL(viewer.getWorldPosition());
				var planesPos = new BABYLON.Vector3(pp[0],pp[1],pp[2]);
				fiberDirColor_shader.setVector3("planesPos",planesPos);
			});
            fiberDirColor_shader.setFloat("planesNum",-1);
            fiberDirColor_shader.setColor4("col",new BABYLON.Color4(0,0,0,0));
			fiberDirColor_shader.setFloat("planesThres",5);
			fiberDirColor_shader.setFloat("planesProj",1);
			fiberDirColor_shader.setFloat("hover",0);
		
			return fiberDirColor_shader;
	}

	function detachShader(shader)
	{
		signalhandler.detach('positionChange',shader.shadersignal);
	}


	function animate3D(dir)
	{
		if (this.animation != undefined)
		{
		   clearInterval(this.animation);
		   this.animation = undefined;
		   return false;
		}
		else
		{
			var speed = 3;
		   this.animation = setInterval(function() 
		   		{ 
		   		  camera.inertialAlphaOffset = dir*0.002*speed; 
		   		  if (camera_picto)
					{
						camera_picto.alpha= viewer.gl.camera.alpha;
						camera_picto.beta= viewer.gl.camera.beta;
						camera_picto.inertialAlphaOffset = viewer.gl.camera.inertialAlphaOffset;
						camera_picto.inertialBetaOffset= viewer.gl.camera.inertialBetaOffset;
					}
		   		  activateRenderLoop();
		   		},100);
		   return true;
		}
	}


/*

	BABYLON.Effect.ShadersStore.mycolorVertexShader = "precision highp float;"+
	"attribute vec3 position;"+
	"attribute vec4 colors;"+
	"varying vec4 vcolor;"+
	"uniform mat4 worldViewProjection;"+
	"void main(void) { vcolor = colors;"+
	"	gl_Position = worldViewProjection * vec4(position, 1.0);"+
	"}";

	BABYLON.Effect.ShadersStore.mycolorPixelShader = "precision highp float;"+
	"varying vec4 vcolor;void main(void) {	gl_FragColor = vcolor;}";


*/
	

		 // This begins the creation of a function that we will 'call' just after it's built
	function createScene() {
		var canvas = $canvas3D[0];

		scene = new BABYLON.Scene(engine);
		//scene.clearColor = new BABYLON.Color3(0.1, 0.1, 0.12);

		

		var rgb = hexToRgb(ViewerSettings.background3D);
		if (rgb != null)
			scene.clearColor = new BABYLON.Color3(rgb.r/255,rgb.g/255,rgb.b/255);
	    else
	        scene.clearColor = new BABYLON.Color3(0.1, 0.1, 0.12);
		
		
		scene.ambientColor = new BABYLON.Color3(0,0,0);

		var order = KMedViewer.getPermutationOrder();


 
		var light = new BABYLON.HemisphericLight("light1", new BABYLON.Vector3(0, 0, 0), scene);
		light.intensity = 2

		light.specular = new BABYLON.Color3(0,0,0);
		light.diffuse = new BABYLON.Color3(1,1,1);
		light.ambient = new BABYLON.Color3(1,1,1);
		light.range = 1;
		

		// create main camera
		createControlsCam();


		if (state.viewer.picto3D && state.viewer.picto3D != -1)
		{

			var pictoModels = [{name:"BodyMesh.obj",offset:[0,0,0],zoom:7 , rotx:Math.PI/2},
							   {name:"LowPolyGirl.obj",offset:[-5,0,0],zoom:6, rotx:-Math.PI/2},
							   {name:"minion.obj",offset:[0,6,0],zoom:0.6 , rotx:Math.PI/2}, 
							   {name:"Bust_Basemesh.obj",offset:[0,8,0],zoom:0.3 , rotx:-Math.PI/2} 
							   ];

			var theModel = pictoModels[state.viewer.picto3D];
		//	if (theModel != undefined)
			{

				// camera of small pictogram 
				camera_picto = new BABYLON.ArcRotateCamera("Camera", -1.6 * Math.PI , Math.PI *0.2,50 , 

				new BABYLON.Vector3(100000+theModel.offset[0],theModel.offset[1],theModel.offset[2]) , scene);
				scene.activeCameras.push(camera);
				scene.activeCameras.push(camera_picto);
				camera_picto.viewport = new BABYLON.Viewport(0.7, -0.05, 0.4, 0.4);
				camera_picto.thepictomodel = [];

		//		var test = BABYLON.Mesh.CreateBox("thumb", 10, scene);
		//		test.position.x =100000;
		//		light.exgodzilla/cludedMeshes.push(test);

				
				var loadmodel = function()
				{
					var theModel = pictoModels[state.viewer.picto3D];				
					if (theModel)
					{
						var loader = new BABYLON.AssetsManager(scene);
						var task = loader.addMeshTask("A2", "", url_pref , "models3d/"+theModel.name);
//						var task = loader.addMeshTask("A2", "", myownurl().replace("index.php","") , "models3d/"+theModel.name);
						task.onSuccess =  function (m)
						{
								for (var k = 0; k < camera_picto.thepictomodel.length;k++)
									camera_picto.thepictomodel[k].dispose();							
							    camera_picto.thepictomodel = [];
								m.loadedMeshes.forEach(function(b) {          
												b.position.x = 100000;
												b.position.z = 0;
												b.position.y = 0;
												b.scaling.x = theModel.zoom;
												b.scaling.y = theModel.zoom;
												b.scaling.z = theModel.zoom;
												b.createNormals();
												b.material = new BABYLON.StandardMaterial("texture1", scene);
												b.rotation.y = theModel.rotx ;
												//meshy.material.diffuseColor = new BABYLON.Color3(1,1,1);
												//meshy.material.emissiveColorColor = new BABYLON.Color3(1,0,1);
												light.excludedMeshes.push(b);
												camera_picto.thepictomodel.push(b);
												activateRenderLoop();
											});
						}
						loader.load();	
					}
					else
					{
						for (var k = 0; k < camera_picto.thepictomodel.length;k++)
							camera_picto.thepictomodel[k].dispose();							
						camera_picto.thepictomodel = [];
					}

				};

				signalhandler.attach("picto3dmodel_changed",function(cm) { return function()
				{
					loadmodel();
				} }(camera_picto));

				loadmodel();

				var light_picto = new BABYLON.HemisphericLight("light1", new BABYLON.Vector3(1, 0.2, 0), scene);
				light_picto.diffuse = new BABYLON.Color3(0.8,0.7,0.2);
				light_picto.intensity = 1;
				 var light_picto = new BABYLON.HemisphericLight("light1", new BABYLON.Vector3(-1, 0.2, 0), scene);
				light_picto.diffuse = new BABYLON.Color3(0.8,0.7,0.2);
				light_picto.intensity = 0.5;
			}
		}

 	    grandParent = BABYLON.Mesh.CreateBox("grandParent", 10, scene);
 	    grandParent.scaling = new BABYLON.Vector3(1, 1, -order.det);
 	  //  grandParent.scalingDeterminant =  -order.det;
 	    grandParent.visibility = false;
 	    grandParent.isPickable = false;
 	    flip = function(p) { return new BABYLON.Vector3(p.x, p.y, -order.det*p.z); }
 	    
       /* grandParent.setPivotMatrix(
              BABYLON.Matrix.FromArray([-2,0,0,0,
										0,-1,0,0,
										0,0,-1,0,
										0,0,0,1 ]));*/




    }


	function createControlsCam()
	{
		var canvas = $canvas3D[0];
		if (camera != undefined)
		{
			camera.dispose();
			control.detachControl(canvas);			
		}
      
        if (KViewer.defaultFOV_mm == "")
        {
		//	console.warn("we need here a defaultFOV calculation");
			if (viewer.content)
			{
				var min = math.multiply(viewer.content.edges,[0,0,0,1])._data
				var max = math.multiply(viewer.content.edges,[viewer.content.sizes[0],viewer.content.sizes[0],viewer.content.sizes[0],1])._data

				KViewer.defaultFOV_mm = Math.max(max[0]-min[0],max[1]-min[1],max[2]-min[2]);
			}
	    }

 	    var canvas = $canvas3D[0];

		camera = new BABYLON.ArcRotateCamera("Camera", -1.6 * Math.PI , Math.PI *0.2, KViewer.defaultFOV_mm*1.2 , BABYLON.Vector3.Zero(), scene);
  	    control = new ArcRotateCameraPointersInput(camera,viewer,_this);
 	    control.attachControl(canvas,true);
 	    if (gl)
 	    {
 	    	gl.camera = camera;
 	    	gl.camera_picto = camera_picto;
 	    }
 			
	}
	signalhandler.attach('webglresetcam',function() {} ); //createControlsCam);


	


    function dispose()
    {
	//	window.removeEventListener("resize",engine.resize);
		
    	
    	var canvas = $canvas3D[0];
		scene.dispose();
		//delete scene;

		engine.stopRenderLoop();
		//engine.dispose();
		//delete engine
		//engine = undefined;

		camera.dispose();
		control.detachControl(canvas);

		clearInterval(saveRender_id);

    }


 
	/////////////////////////////////////////////////////////////////////////////////////////
	////////////////////////////////////////// all creates
	/////////////////////////////////////////////////////////////////////////////////////////

    function createPlaneController(off,sz,parent)
    {
      var radius = 5;
	  for (var j = 0; j < 4;j++)
	  {
		  var controller = BABYLON.Mesh.CreateSphere("planecontroller", radius*2, 10, scene);
	      controller.material = new BABYLON.StandardMaterial("texture1", scene);
		  controller.material.specularColor  = new BABYLON.Color3(0,0,0);
		  controller.material.diffuseColor  = new BABYLON.Color3(0,0,0);
		  //controller.material.specularPower =0;
		  function clear(_this)
		  {
				if (_this.delay_id != undefined) {
					clearInterval(_this.delay_id)
					delete _this.delay_id;
				}
		  }
		  controller.onmousedown = function(evt,pickResult,inputcontrol)
		  {
				var _this = this;
				this.delay_id = setInterval( function()
				{
				   var contextMenu = KContextMenu(
							  function() {
							  	inputcontrol.draggedPlane = undefined;
							  	var $menu =  $("<ul class='menu_context'>");
							  	if (_this.parent.visibility)
							  		$menu.append($("<li onchoice='hide' > hide  </li>"));
							  	else
							  		$menu.append($("<li onchoice='show' > show  </li>"));
								return  $menu;
							  },
							  function(str,ev)
							  { if (str == "hide")
							    {
							  	   _this.parent.visibility = false;
							  	   _this.parent.isPickable = false;
							    }
							  	else
							  	{
							  	   _this.parent.visibility = true;
							  	   _this.parent.isPickable = true;
							  	}
								

							  } ,true);
					contextMenu(evt);


					clear(_this);

				},500);

		  }
		  controller.onmousemove = function(evt)  { clear(this); }
		  controller.onmouseup = function(evt)  { clear(this); }

		  controller.onHoverEnter = function() {
				this.material.diffuseColor  = new BABYLON.Color3(0.5,0.5,0.5);
				activateRenderLoop();
			}
		  controller.onHoverLeave = function() {
				this.material.diffuseColor  = new BABYLON.Color3(0,0,0);
				activateRenderLoop();
			}			      
		  controller.parent = parent;
		  controller.position[off[0]] = (sz[0]/2-radius)  * Math.sign((j%2)-0.5);
		  controller.position[off[1]] = (sz[1]/2-radius)  * Math.sign((Math.round(j/2-0.5)%2)-0.5);
	  }
    }



	KViewer.getPlanes = function()
	{
		return planes;
	}
	KViewer.getGP = function()
	{
		return grandParent;
	}

    function createPlanes()
    {
    	var nii = viewer.nii;
	
//		if (viewer.niiOriginal)
//			nii = viewer.niiOriginal;

    	if (nii)
    	{
			var i= [[0,1,2]]; 
			i[nii.permutationOrder[0]] = 0;  i[nii.permutationOrder[1]] = 1; i[nii.permutationOrder[2]] = 2;
			//i = nii.permutationOrder;
			psz[0] = [ math.round(nii.sizes[i[1]]*nii.voxSize[i[1]]), math.round(nii.sizes[i[2]]*nii.voxSize[i[2]]) ];
			psz[1] = [ math.round(nii.sizes[i[0]]*nii.voxSize[i[0]]), math.round(nii.sizes[i[2]]*nii.voxSize[i[2]]) ];
			psz[2] = [ math.round(nii.sizes[i[0]]*nii.voxSize[i[0]]), math.round(nii.sizes[i[1]]*nii.voxSize[i[1]]) ];


			if (posIndicator != undefined)
				posIndicator.dispose();

			posIndicator = BABYLON.Mesh.CreateSphere("posIndicator", 50, viewer.computeMaxExtentFac()*0.01, scene);
			posIndicator.parent = grandParent;
			posIndicator.material = new BABYLON.StandardMaterial("texture1", scene);
			posIndicator.material.alphaMode = BABYLON.Engine.ALPHA_SUBTRACT;
			posIndicator.material.alpha = 0.1;	
			posIndicator.material.diffuseColor = new BABYLON.Color3(0.1,0.1,0.1);



			control_offs = [['x','y'],['z','y'],['z','x']];

			for (var k=0;k < 3;k++)
			{
			  planes[k] = BABYLON.Mesh.CreateGround("ground"+k, psz[k][0],psz[k][1],1,scene);
			//  planes[k].parent = grandParent;

			//  createPlaneController(control_offs[k],psz[k],planes[k]);

			  textures[k] = new BABYLON.DynamicTexture("dynamic texture", texSize, scene, true);
			  materials[k] = new BABYLON.StandardMaterial('mat', scene);
			  materials[k].specularColor = new BABYLON.Color3(0, 0, 0);
			  materials[k].backFaceCulling = false;
			  materials[k].diffuseTexture = textures[k];
			  materials[k].diffuseTexture.hasAlpha = true;
			  planes[k].material = materials[k];
			  ctxs[k] = textures[k].getContext();
			}

			planes[0].rotation.x = -Math.PI / 2;
			planes[0].rotation.y = -Math.PI ;
			planes[1].rotation.x = -Math.PI / 2 ;
			planes[1].rotation.y = Math.PI / 2 ; 	       
			planes[2].rotation.y = -Math.PI / 2 ;
			planes[2].rotation.x = -Math.PI ;
			planes[2].rotation.z = -Math.PI ;
			planes[0].bakeCurrentTransformIntoVertices()
			planes[1].bakeCurrentTransformIntoVertices()
			planes[2].bakeCurrentTransformIntoVertices()

	









if (0)
{
		// saggital
			for (var j=0;j < vol_planes.length;j++)
			{
				if (vol_planes[j] != undefined)
					vol_planes[j].dispose();
			}
			
		for (var k = 0; k < 3 ; k++)
		{
		  //  var k = 0;
			var sz = nii.sizes[i[k]];
			var szmm = sz*nii.voxSize[i[k]];
			var numPl = 25;
			for (var m=0;m < numPl;m++)
			{
			  var j = k*numPl+m;

			  vol_planes[j] = BABYLON.Mesh.CreateGround("volground"+j, psz[k][0],psz[k][1],1,scene);
			  vol_planes[j].isPickable = false;
			  vol_textures[j] = new BABYLON.DynamicTexture("dynamic texture", texSize, scene, true);
			  vol_textures[j].getAlphaFromRGB = true;
			  vol_materials[j] = new BABYLON.StandardMaterial('mat', scene);
			  vol_planes[j].material = vol_materials[j];
			  vol_materials[j].specularColor = new BABYLON.Color3(0, 0, 0);
			  vol_materials[j].diffuseTexture = vol_textures[j];
			  vol_materials[j].diffuseTexture.hasAlpha = true;
			  vol_materials[j].backFaceCulling = false;
			  vol_materials[j].useAlphaFromDiffuseTexture = true
			  vol_ctxs[j] = vol_textures[j].getContext();
	
	          vol_planes[j].hasVertexAlpha = true;
			  
		  	  vol_planes[j].arr_slicepos = m/numPl*sz;
		  	  vol_planes[j].sliceing = k;
			  var slpos = szmm*m/numPl - szmm/2;
			  if (k == 0)
			  {
				  vol_planes[j].rotation.x = -Math.PI / 2;
				  vol_planes[j].rotation.y = -Math.PI ;
				  vol_planes[j].position.z = slpos;
			  }
			  else if (k == 1)
			  {
				  vol_planes[j].rotation.x = -Math.PI / 2 ;
			      vol_planes[j].rotation.y = Math.PI / 2 ; 	       
				  vol_planes[j].position.x = slpos;
			  } else
			  { 
  				  vol_planes[j].rotation.y = -Math.PI / 2 ;
				  vol_planes[j].rotation.x = -Math.PI ;
				  vol_planes[j].rotation.z = -Math.PI ;
				  vol_planes[j].position.y = slpos;
			  }


			}

		}


}






    	}
			
    }



    function setSurfColor(obj)
    {
		if (obj.gl == undefined)
			return;

		if (obj.color.length == 3)
			var col = [obj.color[0],obj.color[1],obj.color[2]];
		else
		{
			var col = obj.colors[obj.color];
			col = [col[0],col[1],col[2]];
		}

		var of = 100;
		for (var k = 0; k < 3;k++)
			{ col[k] += of; col[k] /= (255+of); }

		if (obj.shader != undefined)
		{
			obj.shader.setVector3("uniformcolor",new BABYLON.Vector3(col[0],col[1],col[2]));
			obj.shader.setFloat("alpha",parseFloat(obj.alpha));
		}
		else
		{

			obj.gl.material.specularColor  = new BABYLON.Color3(col[0]*0.6,col[1]*0.6,col[2]*0.6);
			//obj.gl.material.emissiveColor  = new BABYLON.Color3(col[0]*0.4,col[1]*0.4,col[2]*0.4);
			obj.gl.material.diffuseColor  = new BABYLON.Color3(col[0]*0.4,col[1]*0.4,col[2]*0.4);
			obj.gl.material.ambientColor  = new BABYLON.Color3(col[0]*0.4,col[1]*0.4,col[2]*0.4);
			obj.alpha = parseFloat(obj.alpha);
			obj.gl.material.alpha = obj.alpha;	
			obj.gl.material.backFaceCulling = false;
			//if (obj.alpha != 1)
			//	obj.gl.material.backFaceCulling = obj.alpha != 1;
		}
		activateRenderLoop()
    }



	function createContour(obj,col)
	{
		if (obj.gl != undefined && obj.gl.dispose)
			obj.gl.dispose();
		obj.gl = [];
		obj.gl.dispose = function() { for (var k = 0 ; k < obj.gl.length;k++) 
											obj.gl[k].dispose(); }

        if (obj.fiberDirColor_shader == undefined)
            obj.createShader()


		var x = obj.contour.content.Contours[obj.select].ContourSequence.node;

		var d = [];
		for (var k = 0; k < x.length;k++)
			d.push(new Float32Array(x[k].ContourData));

		var rp = randperm(x.length);
		var chunkSize = 16;
		var cid = setInterval(function()
		{
			if (rp.length == 0 | obj.gl == undefined)
			{
				clearInterval(cid);
				return;
			}
			obj.gl.push(createFiberBundle(d,rp.splice(0,chunkSize),'wholebrain',col,obj.fiberDirColor_shader,obj.contour.content,1))
		},25);


//		obj.gl = createFiberBundle(d,subset,'wholebrain',col,obj.fiberDirColor_shader,obj.contour.content)

	}

	function createConmat(obj)
	{
		if (obj.gl != undefined)
		{
			if (typeof obj.gl == 'object')
				obj.gl.dispose();
			obj.gl = undefined;
		}



		obj.gl = BABYLON.Mesh.CreateSphere("sphere1", 10, 0, scene);
		var centroids = obj.cmat.content.centroids;
		var clim = obj.histoManager.clim;
		var ac = obj.cmat.content.cc;

		function map(v,cmap,thres)
		{
			v = (v-clim[0])/(clim[1]-clim[0]);
			if (v<0) v = 0;
			if (v>1) v = 1;
			return  colormap.mapVal(v,cmap);   
		}

		function mapRad(v,offset,thres)
		{
			v = (v-clim[0])/(clim[1]-clim[0]);			
			if (v<0) v = 0;
			if (v>1) v = 1;
			return  v*3+offset;

			
		}




		var node_thres = 0;
		var node_cmap = 2;
		var conn_thres = 0;
		var conn_cmap = 2;

		var papa = BABYLON.Mesh.CreateSphere("sphere1", 10, 1, scene);
		papa.parent = grandParent;

		var myPath = [new BABYLON.Vector3(1,0,0),new BABYLON.Vector3(-1,0,0)];
	//	var tube_papa = BABYLON.MeshBuilder.CreateTube("tube", {path: myPath,radius:1}, scene);

		var single = false;
		if (ac.length == 1)
			single = true;

		for (var k = 0;k < centroids.length;k++)
		{

			var val;
			if (!single)
				val = ac[k][k];
			else
				val = ac[0][k];

			var offset = 0.5;
			var radius = mapRad(val,offset,node_thres);
			if (radius > offset)
			{
				var col = map(val,node_cmap,node_thres);

				var c = world2GL([centroids[k][0],centroids[k][1],centroids[k][2],1]);

				var a = papa.clone();
				a.hoverColor  = new BABYLON.Color3(1,1,1);
				a.color = new BABYLON.Color3(col[0]/255, col[1]/255, col[2]/255);
				a.material = new BABYLON.StandardMaterial("texture1", scene);
				a.material.diffuseColor  = a.color;
				a.material.alpha = 0.6;
				a.name = obj.cmat.content.cc_labels[k];

				a.position.x = c[0];
				a.position.y = c[1];
				a.position.z = c[2];
				a.position = flip(a.position);

				a.scaling = {x:radius,y:radius,z:radius};	
				a.parent = obj.gl;
				a.renderOutline = true;

				a.onHoverEnter = function(evt) {
					this.material.diffuseColor = a.hoverColor;
					var $anno = $("<div id='Kcmat_annotation'>" + this.name + "</div>").appendTo($(document.body));
					$anno.css("top",evt.clientY);
					$anno.css("left",evt.clientX+10);
				    viewer.gl.activateRenderLoop();
					

				}
				a.onHoverLeave = function(evt) {
					this.material.diffuseColor = this.color;
					$("#Kcmat_annotation").remove();
				}
			}


		if (!single | k==0 )
			for (var j = k+1; j < centroids.length;j++)
			{
				var n = (ac[k][j]-clim[0])/(clim[1]-clim[0]);
				if (n > conn_thres)
				{

					var col = map(ac[k][j],conn_cmap,conn_thres);    
					var rad = mapRad(ac[k][j],1,conn_thres)/2;    
					var c1 = world2GL([centroids[k][0],centroids[k][1],centroids[k][2],1]);
					var c2 = world2GL([centroids[j][0],centroids[j][1],centroids[j][2],1]);
	/*
					var tube = tube_papa.clone();
					tube.parent = obj.gl;
					tube.name = obj.cmat.content.cc_labels[k] + "<br>" + obj.cmat.content.cc_labels[j];
					tube.color  = new BABYLON.Color3(col[0]/255, col[1]/255, col[2]/255);
					tube.material = new BABYLON.StandardMaterial("texture1", scene);
					tube.material.diffuseColor  = tube.color;
				
					tube.position.x = (c1[0]+c2[0])*0.5;
					tube.position.y = (c1[1]+c2[1])*0.5;
					tube.position.z = (c1[2]+c2[2])*0.5;
					tube.scaling.x = radius;
*/

					var myPath = [flip(new BABYLON.Vector3(c1[0],c1[1],c1[2])),flip(new BABYLON.Vector3(c2[0],c2[1],c2[2]))];
					var tube = BABYLON.MeshBuilder.CreateTube("tube", {path: myPath,radius:rad,tessellation:6}, scene);
					tube.parent = obj.gl;
					tube.name = obj.cmat.content.cc_labels[k] + "<br>" + obj.cmat.content.cc_labels[j];
					tube.color  = new BABYLON.Color3(col[0]/255, col[1]/255, col[2]/255);
					tube.material = new BABYLON.StandardMaterial("texture1", scene);
					tube.material.diffuseColor  = tube.color;
					tube.material.alpha=0.6;
					

					tube.onHoverEnter = function(xx) { return function(evt) {
						
						this.material.diffuseColor = a.hoverColor;
						var $anno = $("<div id='Kcmat_annotation'>" + this.name + "<br>" + xx + "</div>").appendTo($(document.body));
						$anno.css("top",evt.clientY);
						$anno.css("left",evt.clientX+10);

					} }(ac[k][j]);
					tube.onHoverLeave = function(evt) {
						this.material.diffuseColor = this.color;
						$("#Kcmat_annotation").remove();
					}


				}

			}

		}








		

	}



	function createSurf(obj,pos,trigs,normals,vals,cut)
	{
		if (pos == undefined)
			return;

		if ((obj.overlays != undefined && obj.overlays.length>0) | vals != undefined )
		{
			if (obj.colors_mapped == undefined || obj.colors_mapped.length != pos.length/3*4)
				obj.colors_mapped = new Float32Array(pos.length/3*4);
			if (obj.overlays.length > 0)
			{

				var colors = obj.colors_mapped;
				var points = obj.surf.content.points;

				for (var j = 0; j < points.length/3;j++)
				{
					colors[4*j] =0; colors[4*j+1] =0; colors[4*j+2] =0; colors[4*j+3] =0; 
				}
				for (var k = 0; k < obj.overlays.length;k++)
				{
					if (obj.overlays[k].atlas)
					{
						var atl = obj.overlays[k].atlas
						var labels;
						if (atl.panel) 
							labels = atl.panel.persistentLabels;
						else
							labels = atl.content.labels;


	    			    var getPixel = KAtlasTool.updateGetPixelFun(atl.content,undefined,labels,undefined,undefined,true);


						acc = function(k,v) {colors[4*k] += v[0]/255; colors[4*k+1] += v[1]/255; colors[4*k+2] += v[2]/255;}
						for (var j = 0; j < points.length/3;j++)
						{
							 var val = getPixel(points[3*j],points[3*j+1],points[3*j+2]);
							 acc(j,val);
						}

					}
					else
					{
						if (!obj.overlays[k].visible)
							continue;
						var ovl = obj.overlays[k];				
						var totsize = ovl.nii.sizes[0] * ovl.nii.sizes[1] * ovl.nii.sizes[2];
						var offs = ovl.nii.currentTimePoint.t * totsize;
						var A = math.inv(ovl.nii.edges)._data;
						/*if (k==0)
							acc = function(k,v) {
								var cv = 0.9-(v[0]+v[1]+v[2])/255/3;

								colors[4*k] = (cv) + v[0]/255; colors[4*k+1] = (cv) + (v[1]/255); colors[4*k+2] = (cv) + v[2]/255;}
						else*/

						var acc = function(k,v) {colors[4*k] += v[0]/255; colors[4*k+1] += v[1]/255; colors[4*k+2] += v[2]/255; colors[4*k+3] += v[3]/255;}
						var acc2 = function(k,v) {colors[4*k] += v[0]/255; colors[4*k+1] += v[1]/255; colors[4*k+2] += v[2]/255; colors[4*k+3] += v[3]/255;
						    var sum = colors[4*k]+colors[4*k+1]+colors[4*k+2];
							colors[4*k] /= sum; colors[4*k+1] /= sum; colors[4*k+2] /= sum; colors[4*k+3] /= sum;
						}

						var colVol = ovl.nii.sizes[3]==3;

						if (!colVol)
						{
							for (var j = 0; j < points.length/3;j++)
							{
								 var val = trilinInterp(ovl.nii, points[3*j],points[3*j+1],points[3*j+2], A, offs);
								 if (val != undefined && !isNaN(val))
								 {							 	
										if (ovl.histoManager.posnegsym)
										{

											if (val > 0)	
											{
												var oVal = ovl.histoManager.mapVal(val);
												if (oVal > 0) 
												{
													oVal = oVal/2+0.5;
													var v = colormap.mapVal(oVal, ovl.histoManager.cmapindex);
													acc(j,v);
												}
											}
											else
											{
												var oVal = ovl.histoManager.mapVal(-val);
												if (oVal > 0)
												{
													oVal = (1-oVal)*0.5;
													if (oVal < 0.01) oVal = 0.01;
													var v = colormap.mapVal(oVal, ovl.histoManager.cmapindex);
													acc2(j,v);
												}
											}
										}
										else
										{
											 var oVal = ovl.histoManager.mapVal(val);
											 var v = colormap.mapVal(oVal, ovl.histoManager.cmapindex);
											 acc(j,v);
										}
								 }
							}
						}
						else
						{

							for (var j = 0; j < points.length/3;j++)
							{
								 var val = trilinInterp3_signcorrected(ovl.nii, points[3*j],points[3*j+1],points[3*j+2], A,totsize); 
								 val = ovl.histoManager.mapVal(val);
								 if (val != undefined && !isNaN(val[0]))
								 {							 	
 									acc(j,val);


								 }
							}


						}
					}

				}
				var bgnd = 1;
				var bgndcol = obj.colors[obj.color];
								

				for (var j = 0; j < points.length/3;j++)
				{
					// var sum = (colors[4*j]+colors[4*j+1]+colors[4*j+2])/3 ;
					 var max = math.max([colors[4*j],colors[4*j+1],colors[4*j+2]]);
					 var f1 = 2+obj.exposure;
					 var f2 = (1-max)/255;
					 colors[4*j] = f1*colors[4*j] + bgndcol[0]*f2;						 
					 colors[4*j+1] = f1*colors[4*j+1] + bgndcol[1]*f2;						 
					 colors[4*j+2] = f1*colors[4*j+2] + bgndcol[2]*f2;						 
					 
				}
			
			}
			else if (vals != undefined)
			{
				var colors = obj.colors_mapped;
				var clim = obj.histoManager.clim;
				for (var j = 0; j < vals.length;j++)
				{
					var v = colormap.mapVal((vals[j]-clim[0])/(clim[1]-clim[0]), obj.histoManager.cmapindex);
					for (var k = 0; k < 3; k++)
					{
						var i = 3*j+k;
						colors[4*i] =v[0]/255; colors[4*i+1] =v[1]/255; colors[4*i+2] =v[2]/255;colors[4*i+3] =v[3]/255; 
					}

				}
			}
		}
		var dynMesh = new BABYLON.Mesh("dynMesh", scene);
	
        var vertexData = new BABYLON.VertexData();
        vertexData.positions = pos;
        vertexData.indices = trigs;
        vertexData.normals = normals;
        vertexData.colors = obj.colors_mapped;
        vertexData.applyToMesh(dynMesh, 1);

		if (0) //cut == 0 | cut == undefined)
		{
			obj.shader = undefined;
			dynMesh.material = new BABYLON.StandardMaterial("texture1", scene);
			dynMesh.material.specularPower = 0;
			dynMesh.material.backFaceCulling = false;
			dynMesh.material.alphaMode =obj.alphaMode;
		
		//	dynMesh.showBoundingBox = true;
		//dynMesh.renderOutline =true
		//	console.log(obj.alphaMode);

			dynMesh.setPivotMatrix(world2GL_BJS_matrix(),oldBablyonFlag);
		}
		else
		{
		    if (obj.shader != undefined)
		    	detachShader(obj.shader);

			var shader = createCutSurfShader(obj);

			shader.updateTilts = function()
			{
				var x = math.diag([1,1,1,1]);
				if (KViewer.mainViewport != -1)
					x = ((viewer.getReorientMat(undefined,viewer.getWorldPosition())));
				var M = world2GL_BJS_matrix_M(x);
				shader.setMatrix("worldToVoxel",M);
			}
			shader.updateTilts();
			dynMesh.setPivotMatrix( world2GL_BJS_matrix(),oldBablyonFlag);
			dynMesh.material = shader;


			obj.shader = shader;

			var pp = world2GL(viewer.getWorldPosition());
			var planesPos = new BABYLON.Vector3(pp[0],pp[1],pp[2]);
			shader.setVector3("planesPos",planesPos);

			if (obj.overlays.length > 0 | vals != undefined )
				shader.setFloat('vertexcoloring',1)
			else
				shader.setFloat('vertexcoloring',0)

			shader.setFloat('gamma',obj.gamma)

		}

		dynMesh.isPickable = obj.pickable;
		if (pos.length > 256000) 
		{
			dynMesh.isPickable = false;
			dynMesh.largeMesh = true;
		}
/*
		dynMesh.onHoverEnter = function(evt) {
			if (obj.$captiondiv == undefined)
				return
			obj.$captiondiv.addClass("highlight");
			if (obj.refRoiView && obj.refRoiView.$captiondiv) 
				obj.refRoiView.$captiondiv.addClass("highlight");
		}
		dynMesh.onHoverLeave = function(evt) {
			if (obj.$captiondiv == undefined)
				return
			obj.$captiondiv.removeClass("highlight");
			if (obj.refRoiView && obj.refRoiView.$captiondiv) 
				obj.refRoiView.$captiondiv.removeClass("highlight");
		}
*/


		obj.gl = dynMesh;

		setSurfColor(obj);
	    dynMesh.parent = grandParent;
		dynMesh.contextmenu = obj.contextmenu3D;


	}


	function createFreeSurf(that)
	{

	    var obj = {color:[255,0,0],alpha:1,cuts:[0,0,0],overlays:[]};

		var papa = BABYLON.Mesh.CreateSphere("sphere1", 50, 0, scene);
		papa.visibility = 0;
		papa.parent = grandParent;

		createSurf(obj,that.points,that.indices,that.normals,undefined,0);
		if (obj.gl)
		{
			obj.gl.parent = papa; 
			//obj.gl.enableEdgesRendering(.9999999999);	
			//obj.gl.edgesWidth = 100.0;
			obj.gl.material.alpha =1
			obj.gl.edgesColor = new BABYLON.Color3(1,1,0.3);
			//obj.gl.alphaIndex = 1000;
			obj.gl.material.alphaMode = 3;
			obj.gl.material.alpha = 1;

			var outline = createTrace(that,{width:1,closed:true});
			if (outline != undefined)
				outline.parent = papa;

			obj.gl = papa;



			return obj.gl;
		}
	}



	function createSurface(obj)
	{

		if (obj.gl != undefined)
		{
			if (obj.gl.dispose)
				obj.gl.dispose();
			obj.gl = undefined;
		}
	
		if (!obj.visible)
			return;

		var gii = obj.surf.content;

		if (obj.visible == undefined || (obj.visible != undefined && obj.visible == true))
			createSurf(obj,gii.points,gii.indices,gii.normals,gii.vals,obj.cut)

	}




/*

	function createSurface(obj)
	{

		if (obj.gl != undefined)
		{
			obj.gl.dispose();
			obj.gl = undefined;
		}
	
		if (!obj.visible)
			return;

		var gii = obj.surf.content;

		var dynMesh = new BABYLON.Mesh("dynMesh", scene);
	
		if (obj.cut == 0)
		{

			dynMesh.material = new BABYLON.StandardMaterial("texture1", scene);
	//		dynMesh.material.diffuseColor  = new BABYLON.Color3(col[0]*0.1,col[1]*0.1,col[2]*0.1);
	//		dynMesh.material.specularColor  = new BABYLON.Color3(col[0]*0.4,col[1]*0.4,col[2]*0.4);
			dynMesh.material.specularPower = 2;
			dynMesh.material.backFaceCulling = false;

			dynMesh.setPivotMatrix(world2GL_BJS_matrix());
		}
		else
		{
		    if (obj.shader != undefined)setSurfColor
		    	detachShader(obj.shader);

			var shader = createCutSurfShader();
			shader.setMatrix("worldToVoxel",world2GL_BJS_matrix());
			shader.backFaceCulling = false;
			dynMesh.setPivotMatrix(world2GL_BJS_matrix());
			dynMesh.isPickable = false;
			dynMesh.material = shader;

			obj.shader = shader;

			var pp = world2GL(viewer.getWorldPosition());
			var planesPos = new BABYLON.Vector3(pp[0],pp[1],pp[2]);
			shader.setVector3("planesPos",planesPos);

		}



        var vertexData = new BABYLON.VertexData();
        vertexData.positions = gii.points;
        vertexData.indices = gii.indices;
        vertexData.normals = gii.normals;      
        vertexData.applyToMesh(dynMesh, 1);

		obj.gl = dynMesh;

		setSurfColor(obj);
	    dynMesh.parent = grandParent;
 
		dynMesh.contextmenu = obj.contextmenu3D;

	}


*/


	function createFiberBundle(lines,subset,name,color,shader,obj,ras)
	{
			var sg = 1;
			if (ras)
				sg = -1;


  			var indices = [];
            var positions = [];
            var colors = [];
            var plens = [];
            var fibers;
            var idx = 0;
            var subsetlen = subset.length;
            for (var l = 0; l < subsetlen; l++) {
            	if (lines[subset[l]] == undefined)
            	{
            		console.error('bug in fiber indexing!');
            		break;
            	}
              //  var points =  Array.prototype.slice.call(lines[subset[l]]);
				var points = [];
				var pts = lines[subset[l]];
				var plen = pts.length/3;
				var osamp = 1;
				var c = 0;
				for (var k = 0 ; k < plen;k+=osamp)
				{
					points[3*c] = sg*pts[3*k];
					points[3*c+1] = sg*pts[3*k+1];
					points[3*c+2] = pts[3*k+2];
					c++;
				}
				plens.push(c)
				
                positions = positions.concat(points);
                var plen = points.length/3;
                var rcol = Math.random();

                for (var index = 0; index < plen; index++) {
                    if (index > 0) {
                        indices.push(idx - 1);
                        indices.push(idx);
						var r = Math.abs(points[3*index] - points[3*(index-1)]);
						var g = Math.abs(points[3*index+1]-points[3*(index-1)+1]);
						var b = Math.abs(points[3*index+2]-points[3*(index-1)+2]);
						r*=r; g*=g; b*=b;
						var s = r+g+b;
						colors.push(r/s,g/s,b/s,rcol);
                    }
                    idx++;
                }
				colors.push(r/s,g/s,b/s,1);
            }
            var vertexData = new BABYLON.VertexData();
            vertexData.indices = new Uint32Array(indices);
            vertexData.positions = new Float32Array(positions);
			vertexData.colors = new Float32Array(colors);

			fibers = new BABYLON.LinesMesh(name, scene);

			fibers.parent = grandParent;
			fibers.isPickable = false;

			fibers._colorShader = shader;
			var pp = world2GL(viewer.getWorldPosition());
			var planesPos = new BABYLON.Vector3(pp[0],pp[1],pp[2]);
			shader.setMatrix("worldToVoxel",world2GL_BJS_matrix())
			shader.setVector3("planesPos",planesPos);

		//	fibers._positionBuffer['colors'] = new BABYLON.VertexBuffer(scene.getEngine(),colors,'color',true)		

			if (color == 'dir')
				shader.setVector4("col",new BABYLON.Vector4(0,0,0,0));
			else
				shader.setVector4("col",new BABYLON.Vector4(color[0]/255,color[1]/255,color[2]/255,1));
       
            vertexData.applyToMesh(fibers, true);

			if (obj != undefined && obj.max != undefined)
			{
				var vis = [(obj.max[0]-obj.min[0])/2,(obj.max[1]-obj.min[1])/2,(obj.max[2]-obj.min[2])/2];
				fibers._boundingInfo = new BABYLON.BoundingInfo(new BABYLON.Vector3(-vis[0], -vis[1], -vis[2]), new BABYLON.Vector3(vis[0], vis[1], vis[2]));
			}

			//fibers.positions = positions;
			//fibers.plens = plens;

            return fibers;
	}





function doDownload(filename) {

var filename = "test";
	var mesh = grandParent;

    var serializedMesh = BABYLON.SceneSerializer.SerializeMesh(mesh,false,true);

    var strMesh = JSON.stringify(serializedMesh);

    if (filename.toLowerCase().lastIndexOf(".babylon") !== filename.length - 8 || filename.length < 9){
        filename += ".babylon";
    }

    var blob = new Blob ( [ strMesh ], { type : "octet/stream" } );

    // turn blob into an object URL; saved as a member, so can be cleaned out later
    objectUrl = (window.webkitURL || window.URL).createObjectURL(blob);

    var link = window.document.createElement('a');
    link.href = objectUrl;
    link.download = filename;
    var click = document.createEvent("MouseEvents");
    click.initEvent("click", true, false);
    link.dispatchEvent(click);          
}




    var annomesh_cnt = 0;
    /*
	function createAnnotationMesh(point,col,radius,dragcontroller,hoverenter,hoverleave)
	{
		if (!radius)
			radius = viewer.computeMaxExtentFac()*0.1;
		var c = world2GL(point.coords);
		var a = BABYLON.Mesh.CreateSphere("marker", 50, radius, scene);
		annomesh_cnt++;
		a.hoverColor  = new BABYLON.Color3(1,1,1);
		a.parent = grandParent;
		a.point = point;
		a.color = new BABYLON.Color3(col.r/255, col.g/255, col.b/255);
		a.material = new BABYLON.StandardMaterial("texture1", scene);
		a.material.backFaceCulling = false;
		a.material.diffuseColor  = a.color;
		a.material.alpha = 0.5;
		a.name = 'marker';
		a.isPickable = true;
		a.setPosition = function(point)
		{
			if (point == undefined)
				point = this.point;
 		    var c = world2GL(point.coords);
			this.position.x = c[0];
			this.position.y = c[1];
			this.position.z = c[2];			
		}
		a.dragController = dragController(viewer,a, 
			function(c,ev) {  
				var p = GL2world([c.x,c.y,c.z]);
				point.coords = p._data;
				if (dragcontroller != undefined)
					dragcontroller();
			    else
					KViewer.annotationTool.updatepoint(point);
				//a.material.alpha = 1;
				//for (var k in0.59 point.onupdate)
				//	point.onupdate[k](c,ev);
						},
			function (c,ev) {
				this.material.diffuseColor = a.hoverColor;
			});
		a.onHoverEnter = function() {
			if (hoverenter == undefined)
				KViewer.annotationTool.onHoverEnter(point.uuid);
			else
				hoverenter(point);
			this.material.diffuseColor = a.hoverColor;
		}
		a.onHoverLeave = function() {
			if (hoverleave == undefined)
				KViewer.annotationTool.onHoverLeave(point.uuid);
			else
				hoverleave(point);
			this.material.diffuseColor = a.color;
		}
		a.setPosition(point);
		return a;
	}
	*/
 
 	function createTrace(markerset,params)
	{
	    viewer.gl.activateRenderLoop();
		var ps = markerset.getPoints();
		if (ps.length < 2)
			return;
			
		function createPath(i,j)
		{
			var c1,c2;
			if (markerset.resorted)
			{
				i = markerset.resorted[i].i;
				j = markerset.resorted[j%ps.length].i;
			}





			c1 = (ps[i%ps.length].p.coords);
			var s1 = ps[i%ps.length].p.size;
			c2 = (ps[j%ps.length].p.coords);
			var s2 = ps[j%ps.length].p.size;
			var dd = [c1[0]-c2[0],c1[1]-c2[1],c1[2]-c2[2]];
			var dnorm = Math.sqrt(dd[0]*dd[0]+dd[1]*dd[1]+dd[2]*dd[2]);
			
			c1 = [c1[0]-dd[0]*s1/dnorm,c1[1]-dd[1]*s1/dnorm,c1[2]-dd[2]*s1/dnorm,1];
			c2 = [c2[0]+dd[0]*s2/dnorm,c2[1]+dd[1]*s2/dnorm,c2[2]+dd[2]*s2/dnorm,1];
/*



			c1 = (ps[i%ps.length].p.coords);
			c2 = (ps[j%ps.length].p.coords);

*/

			c1 = world2GL(c1);
			c2 = world2GL(c2);
			c1[0] += 0.00000001; // god (or google) knows why that
			
			var col = new BABYLON.Color3(1,0,0);
			if (params.color) 
				col = params.color.getBabylon();

			var myPath = [(new BABYLON.Vector3(c1[0],c1[1],c1[2])),(new BABYLON.Vector3(c2[0],c2[1],c2[2]))];
						var tube = BABYLON.MeshBuilder.CreateTube("tube", {path: myPath,radius:params.width,tessellation:10}, scene);
						tube.parent = grandParent
						tube.name = markerset.name;
						tube.isPickable = true;
						tube.color  = col;
						tube.material = new BABYLON.StandardMaterial("texture1", scene);
						tube.material.diffuseColor  = tube.color;
						tube.material.specularPower = 5
						//tube.material.wireframe = true;
						tube.material.specularColor = new BABYLON.Color3(0.8,0.8,0.8)

						tube.hoverColor = new BABYLON.Color3(1,1,1);
						tube.material.backFaceCulling = false;

						if (markerset.type == 'freeline' || markerset.type == 'surface')
						{
							tube.after = ps[i%ps.length];
							tube.onHoverEnter = function() {
								this.material.diffuseColor = tube.hoverColor;
							}
							tube.onHoverLeave = function() {
								this.material.diffuseColor = tube.color;
							}
						}

			return tube;
		}

		var papa = createPath(0,1);
		for (var k = 1; k < ps.length-1 + (params.closed?1:0);k++)
			{
				var path = createPath(k,k+1);
				path.parent = papa;
			}


		return papa;
	}

	function createElectrode(markerset,params)
	{
	    viewer.gl.activateRenderLoop();
		var ps = markerset.getPoints();
		if (ps.length < 2)
			return;
		var end = ps[0].p.coords; 
		var tip = ps[1].p.coords; 

		var n = [tip[0]-end[0],tip[1]-end[1],tip[2]-end[2]];
		var norm = Math.sqrt(n[0]*n[0]+n[1]*n[1]+n[2]*n[2]);
		n[0] /= norm; n[1] /= norm; n[2] /= norm;
			
		function createPath(i,j)
		{
			var c1 = world2GL(ps[i].p.coords);
			var c2 = world2GL(ps[j].p.coords);
			c1[0] += 0.00000001; // god (or google) knows why that
			var myPath = [(new BABYLON.Vector3(c1[0],c1[1],c1[2])),(new BABYLON.Vector3(c2[0],c2[1],c2[2]))];
						var tube = BABYLON.MeshBuilder.CreateTube("tube", {path: myPath,radius:params.width,tessellation:20}, scene);
						tube.parent = grandParent
						tube.name = markerset.name;
						//tube.isPickable = false;
						tube.color  = new BABYLON.Color3(1,0,0);
						tube.hoverColor  = new BABYLON.Color3(1,0.7,0.7);
						tube.material = new BABYLON.StandardMaterial("texture1", scene);
						tube.material.diffuseColor  = tube.color;
						tube.material.backFaceCulling = false;
			return tube;
		}

		var papa = createPath(0,1);
	
		
		return papa;
	}

	function createMarkerMesh(point)
	{
	    viewer.gl.activateRenderLoop();

		var c = world2GL(point.p.coords);
		var vx = viewer.computeMaxExtentFac()*2/300;

		var a = BABYLON.Mesh.CreateSphere("marker" , 50, 1, scene);

		col = {r:255, g:255, b:255};
		annomesh_cnt++;
		a.hoverColor  = new BABYLON.Color3(1,1,1);
		a.material = new BABYLON.StandardMaterial("texture1", scene);
		a.material.backFaceCulling = false;
		a.material.alpha= 0.5;
		a.point = point;	
		a.parent = grandParent;
		a.renderOutline = true;
		if (point.pickable != undefined)
			a.isPickable = point.pickable ;
		else
			a.isPickable = true;
		a.setpoint = function(point)
		{
  	        viewer.gl.activateRenderLoop();
			
			a.color  = point.p.color.getBabylon();
			var alpha = point.p.color.getAlpha();
			//if (alpha == 0 )
			    alpha = 0.5
			a.material.alpha = alpha
			a.material.diffuseColor = a.color;
			a.scaling.x = point.p.size*2;
			a.scaling.y = point.p.size*2;
			a.scaling.z = point.p.size*2;
 		    var c = world2GL(point.p.coords);
			this.position.x = c[0];
			this.position.y = c[1];
			this.position.z = c[2];			
		}
		a.dragController = dragController(viewer,a, 
			function(c,ev) 
			{  
				
				if (point.isElectrodeEnd && ! ev.ctrlKey)
				{
					if (helperMesh == undefined)
					{
						var p = point.p.coords; //GL2world([c.x,c.y,c.z])._data;
						point.movepoint(p);
						var tip = point.isElectrodeEnd.p.coords;
						var dif = [tip[0]-p[0],tip[1]-p[1],tip[2]-p[2]];
						var dist = Math.sqrt(dif[0]*dif[0]+dif[1]*dif[1]+dif[2]*dif[2]);
						var tipgl = world2GL(tip);
						helperMesh =  BABYLON.Mesh.CreateSphere("marker" , 20, 1, scene);
						helperMesh.position.x = tipgl[0];
						helperMesh.position.y = tipgl[1];
						helperMesh.position.z = tipgl[2];
						helperMesh.scaling.x = dist*2;
						helperMesh.scaling.y = dist*2;
						helperMesh.scaling.z = dist*2;

						helperMesh.material = new BABYLON.StandardMaterial("texture1", scene);
						helperMesh.material.backFaceCulling = false;
						helperMesh.material.alpha= 0.1;
						helperMesh.material.wireframe = true;
						helperMesh.color  = new BABYLON.Color3(1,1,1);
						helperMesh.parent = grandParent;
					}
					else
					{
						var p = GL2world([c.x,c.y,c.z]);
						point.movepoint(p._data);
						a.material.alpha = point.p.color.getAlpha();
					}
					
				}
				else
				{
					if (!point.locked)
					{
						var p = GL2world([c.x,c.y,c.z]);
						point.movepoint(p._data);
					}
					else
					{
						point.movepoint(point.p.coords);
					}	
				}				

							
				//for (var k in point.onupdate)
				//	point.onupdate[k](c,ev);
			},
			function (c,ev) {
				a.material.diffuseColor = a.hoverColor;
				if (helperMesh)
				{
					helperMesh.dispose();
					helperMesh = undefined;
				}
			});
 		a.onHoverEnter = function(e) {
 			point.onHoverEnter(e);
 			a.currenthoverdiv = $("<div class='markerhover3d'>" + point.p.name + "</div>" ).appendTo($(document.body));
			a.currenthoverdiv.css('left',e.clientX);
			a.currenthoverdiv.css('top',e.clientY);


 			this.material.diffuseColor = a.hoverColor;
 		}
 		a.onHoverLeave = function(e) {
 			point.onHoverLeave(e);
 			this.material.diffuseColor = a.color;
 			if (a.currenthoverdiv != undefined)
 			{
 				a.currenthoverdiv.remove()
 				a.currenthoverdiv = undefined;
 			}
 		}
		
		a.setpoint(point);
		return a;
	}


	//////////////////////////////////////////////////////////////////////////////////////////////
	//////////////////////// coordinate transformations
	/////////////////////////////////////////////////////////////////////////////////////////////


    function tiltMat(t1,t2,slicing)
    {
		var six = Math.sin(t1/180*Math.PI);
        var siy = Math.sin(t2/180*Math.PI);
		var rvec;
		if (slicing == 0)
		  rvec = [myeps, six, siy];
		else if (slicing == 1)
		  rvec = [six,myeps, siy];		  
		else if (slicing == 2)
		  rvec = [siy,six,myeps];
        var ang = Math.asin(Math.sqrt(rvec[0]*rvec[0]+rvec[1]*rvec[1]+rvec[2]*rvec[2]));
       
    	return BABYLON.Quaternion.RotationAxis(new BABYLON.Vector3(rvec[0]/ang,rvec[1]/ang,rvec[2]/ang),ang);
    }

	function world2GL_matrix()
	{
		var nii;
		if (viewer.nii)
			nii = viewer.nii;
		//if (viewer.niiOriginal)
		//	nii = viewer.niiOriginal;



		if (nii != undefined)
		{
			var i= [[0,1,2]]; i[nii.permutationOrder[0]] = 0;  i[nii.permutationOrder[1]] = 1; i[nii.permutationOrder[2]] = 2;
			var m = [
			    nii.sizes[i[0]]* nii.voxSize[i[0]]/2,
			    nii.sizes[i[1]]* nii.voxSize[i[1]]/2,
			    nii.sizes[i[2]]* nii.voxSize[i[2]]/2 ];
			var ee =  nii.edges;
			if (KViewer.mainViewport !== -1)
				 ee = math.multiply(KViewer.reorientationMatrix.matrix, ee);

			var q = math.matrix(math.diag([0,0,0,1]))._data;
			for (var j = 0;j < 3;j++)
			{
				if ( nii.arrayReadDirection[j] == 1)
				{
					q[ nii.permutationOrder[j]][j] =  nii.voxSize[j];         //(c_[i[k]]+0.5)* nii.voxSize[i[k]]-m[k];
					q[ nii.permutationOrder[j]][3] = -m[ nii.permutationOrder[j]]+0.5* nii.voxSize[j];
				}
				else
				{
					q[ nii.permutationOrder[j]][j] = - nii.voxSize[j];                    //c[k] = m[k]-(c_[i[k]]+0.5)* nii.voxSize[i[k]];
					q[ nii.permutationOrder[j]][3] = m[ nii.permutationOrder[j]]- nii.voxSize[j]*0.5;
				}
			}
			var fac = 1;
			var p = [[0,fac,0,0],[0,0,fac,0],[fac,0,0,0],[0,0,0,1]];

			return math.multiply(p,math.multiply(q,math.inv(ee)));
		}
		else
		{
			return math.matrix([[0,1,0,0],[0,0,1,0],[1,0,0,0],[0,0,0,1]]);

		}

	}

	function world2GL_BJS_matrix()
	{
  		var m = math.transpose(world2GL_matrix())._data;
  		return BABYLON.Matrix.FromArray([m[0][0],m[0][1],m[0][2],m[0][3], 
										m[1][0],m[1][1],m[1][2],m[1][3], 
										m[2][0],m[2][1],m[2][2],m[2][3], 
										m[3][0],m[3][1],m[3][2],m[3][3] ]);
	}

	function world2GL_BJS_matrix_M(M)
	{
  		var m = math.transpose(math.multiply(world2GL_matrix(),M))._data;
  		return BABYLON.Matrix.FromArray([m[0][0],m[0][1],m[0][2],m[0][3], 
										m[1][0],m[1][1],m[1][2],m[1][3], 
										m[2][0],m[2][1],m[2][2],m[2][3], 
										m[3][0],m[3][1],m[3][2],m[3][3] ]);
	}

	function world2GL(p)
	{
		  var m = world2GL_matrix();
		  var x = math.multiply(m,p);
		  if (x._data) x =x._data;
		  return [x[0],x[1],x[2]];
	}
	function GL2world(c)
	{
		  var m = math.inv(world2GL_matrix());
		  var x = math.multiply(m,[c[0],c[1],c[2],1]);
		  if (x._data) x =x._data;
		  return math.matrix([x[0],x[1],x[2],1]);
	}

	function GL2world_withflip(c)
	{
		  var pP = flip(c);
		  return GL2world([pP.x,pP.y,pP.z]);	 						
	}

	this.GL2world_withflip = GL2world_withflip;
	this.GL2world = GL2world;
	this.world2GL = world2GL;

	//////////////////////////////////////////////////////////////////////////////////////////////
	//////////////////////// updates
	/////////////////////////////////////////////////////////////////////////////////////////////
	
 
    function updatePlanes()
    {
		if (planes.length == 0)
			return;

	    if (planes[0] == undefined)			
	    	updateLayout()

	    viewer.gl.activateRenderLoop();
  	    var c = world2GL(viewer.getWorldPosition());



		posIndicator.position.x = c[0];
		posIndicator.position.y = c[1];
		posIndicator.position.z = c[2];

        var sg0 =1;// viewer.nii.arrayReadDirection[0];
        var sg1 =1;// viewer.nii.arrayReadDirection[1];      
        var sg2 =1;// viewer.nii.arrayReadDirection[2];
 
    /*    var sg0 = viewer.nii.arrayReadDirection[0];
        var sg1 = viewer.nii.arrayReadDirection[1];      
        var sg2 = viewer.nii.arrayReadDirection[2];
   */

		var idx = [0,1,2];
   		var matrix,t;

		// coronal		
		t = [-c[0],-c[1],-c[2]]; 
		 t[0] = 0; 
		matrix = BABYLON.Matrix.Translation(t[0],t[1],t[2]); 
		planes[1].setPivotMatrix(matrix,oldBablyonFlag);
		planes[1].rotationQuaternion = tiltMat(sg2* KViewer.currentTilts_(2,1).v,sg0* KViewer.currentTilts_(0,0).v,0);

		// transversal
		t = [-c[0],-c[1],-c[2]]; 
		t[1] = 0;
		matrix = BABYLON.Matrix.Translation(t[0],t[1],t[2]); t[1] = 0;
		planes[2].setPivotMatrix(matrix,oldBablyonFlag);
		planes[2].rotationQuaternion =	tiltMat(-sg1* KViewer.currentTilts_(1,1).v,sg0*KViewer.currentTilts_(0,1).v,1);


		// saggital
		t = [-c[0],-c[1],-c[2]]; 
		t[2] = 0;
		matrix = BABYLON.Matrix.Translation(t[0],t[1],t[2]); t[2] = 0;
		planes[0].setPivotMatrix(matrix,oldBablyonFlag);
		planes[0].rotationQuaternion =  tiltMat(sg2*KViewer.currentTilts_(2,0).v,-sg1* KViewer.currentTilts_(1,0).v,2);

  	 
	   for (var k = 0;k < 3;k++)
	   {
		   planes[k].position.x = c[0];
		   planes[k].position.y = c[1];
		   planes[k].position.z = c[2];
	   }


	   for (var pl = 0; pl < 3; pl++)
  	      if (planesVisibility[pl])
		  {
		  	planesVisibility[pl] = true;
			planes[pl].visibility = 1;
			planes[pl].isPickable = true;
		  }
		  else
		  {
			planes[pl].visibility = -1;
			planes[pl].isPickable = false;
		  }

	   for (var k = 0;k < 3;k++)
	     planes[k].parent = grandParent;

    }

	function updateLayout()
	{
		setQuality();
		if (viewer.nii == undefined || currentLayout != viewer.nii.edges._data.toString() || planes[0] == undefined)
			{
				disposePlanes();
				createPlanes();
				updateObjects();
			}
		if (viewer.nii != undefined )
	    	currentLayout = viewer.nii.edges._data.toString();
	    
	}

	function setQuality()
	{
		if (camera)
		{
			var r = camera.radius/viewer.computeMaxExtentFac();
			var scaling = Math.min($(document.body).width(),$(document.body).height())
						 /ViewerSettings.quality3D/r/200;
			if (scaling < 1) 
				scaling = 1;
			engine.setHardwareScalingLevel(scaling);
		}
	}


	function updateObjects()
	{
		updatePlanes();
		for (var k = 0; k < viewer.objects3D.length;k++)
			viewer.objects3D[k].update();
	}

    function disposePlanes()
    {
		for (var k = 0; k < 3;k++)
		{
			if (planes[k] != undefined)
			{
				//planes[k].parent = undefined;
				planes[k].dispose();
				planes[k] = undefined;
			}
		}
    }




	function createPencil(type,pickable)
	{
		if (pencil == undefined)
		{					
		    var vx = viewer.computeMaxExtentFac()*2/300;
		    var radius;
		    if (viewer.currentROI != undefined)
		    	radius = KViewer.roiTool.pencil.radius*vx;
		   	else
		    	radius = viewer.gl.selectionRadius;

			if (type == undefined | type == 'plane')	
			{
				pencil = BABYLON.Mesh.CreateTorus("torus", radius, vx*0.3, 20, scene, false);
				pencil.parent = grandParent;
				pencil.type == 'plane';
			}
			else
			{
   	  	        pencil = BABYLON.Mesh.CreateSphere("pencilball", 20,radius, scene,false);
   	  	        pencil.parent = grandParent;
				pencil.type == 'ball';				
			}
			pencil.material = new BABYLON.StandardMaterial("texture1", scene);
			control;
			if (control._isAltPushed)
				pencil.material.diffuseColor  = new BABYLON.Color3(0,1,1);
			else if (control._isCtrlPushed)
				pencil.material.diffuseColor  = new BABYLON.Color3(0,1,0);
			else
				pencil.material.diffuseColor  = new BABYLON.Color3(1,1,0);
			pencil.material.backFaceCulling = false;
			pencil.material.alpha = 0.5;
			if (pickable != undefined)
				pencil.isPickable = pickable;
			else
				pencil.isPickable = false;
 		    activateRenderLoop();

		}
	}

	function makePencilPickable()
	{
		if(pencil != undefined)
			pencil.isPickable = true;
	}

	function setPencilProps(pickResult)
	{

		if (pickResult.pickedMesh != null && pickResult.pickedMesh.name != 'marker')// && pencil != undefined)
		{

			var mat = BABYLON.Matrix.Identity();
			var s = 1;

			if (viewer.currentROI != undefined  && pencil != undefined && !KViewer.roiTool.regionGrow)	
			{
				var sl = slice(pickResult,false);
				if (sl>=0 & sl <=2)
				{
				   if (pencil.type != 'plane')
				   {
					   disposePencil();
					   createPencil('plane');
				   }			   
				}
				else
				{
				   if (pencil.type != 'sphere')
				   {
					   disposePencil();
					   createPencil('sphere');
				   }			   


				}
			}
			else if (viewer.getCurrentFiberView() != undefined)
			{
			    disposePencil();
				if (viewer.getCurrentFiberView().associated_annotation == -1)
				{			
				   createPencil('sphere');
				}
			
			}
			else
			  disposePencil();
			
			if (pencil != undefined)
			{
				pencil.position = flip(pickResult.pickedPoint);

				if (sl == 0)
				  mat = BABYLON.Matrix.FromArray([s,0,0,0, 0,0,-s,0, 0,s,0,0, 0,0,0,1]);
				else if (sl == 1)
				  mat = BABYLON.Matrix.FromArray([0,s,0,0, -s,0,0,0, 0,0,s,0, 0,0,0,1]);
				else if (sl == 2)
				  mat = BABYLON.Matrix.FromArray([s,0,0,0, 0,s,0,0, 0,0,s,0, 0,0,0,1]);

				pencil.setPivotMatrix(mat,oldBablyonFlag);
			}
		}
		else
			disposePencil();
	}


	function disposePencil()
	{
		if (pencil != undefined)
			{
				pencil.dispose();
				pencil = undefined;
			}
	}




	function slice(pickResult,perm)
	{
		if (pickResult.pickedMesh != null)
		{
			var i= [0,1,2]; 
			if (perm)
			{
				i[viewer.nii.permutationOrder[0]] = 0;  i[viewer.nii.permutationOrder[1]] = 1; i[viewer.nii.permutationOrder[2]] = 2;					
			}
			if (pickResult.pickedMesh.id == "ground0")
				return i[0];
			else if (pickResult.pickedMesh.id == "ground1")
				return i[1];
			else if (pickResult.pickedMesh.id == "ground2")
					return i[2];
		}
		return undefined;
	}




	function modifyFibersByPick(pickResult,_this,type,delta)
	{
		if (pickResult.pickedMesh)
			{
				for (var k = 0; k < _this.viewer.objects3D.length;k++)
				{
					var tck = _this.viewer.objects3D[k];
					if (tck.isCurrent)
					{
						if (pickResult.pickedPoint == undefined)
							return;

						var pP = _this.viewer.gl.flip(pickResult.pickedPoint);
						var p = _this.viewer3D.GL2world([pP.x,pP.y,pP.z]);	 						
						if (delta != undefined)
							tck.modifyByPick(p,type,delta);
						else
							tck.modifyByPick(p,type);
					}
				}

			}
	}



	 var planesVisContextMenu = new KContextMenu(
				  function() { 
					 var $menu = $("<ul class='menu_context'>");
					 var name = ['Saggital','Coronal','Transversal'];
					 $menu.append($("<hr width='100%'> ")); 					 					
					 $menu.append($("<span> &nbsp Planes visible</span>"));
					 $menu.append($("<hr width='100%'> ")); 		
					  var perm = [0,1,2]; //[viewer.nii.permutationOrder[0],viewer.nii.permutationOrder[1],viewer.nii.permutationOrder[2]];
					  perm[-1] = -1;
					 for (var k = 0;k <3;k++)
					 {
					 	var sel = '';
//					 	if (planesVisibility[perm[k]])
					 	if (planesVisibility[k])
					 	  sel = 'check-';
						var $li = $("<li  onchoice='vis_"+k+"' > "+name[k]+"<i  onchoice='vis_"+k+"' class='fa fa-"+sel+"square-o'></i> </li>");

						var val = '';
						if (planes[k].material.alpha != 1)
							val = 'value="'+planes[k].material.alpha +'"';

						var $t = $(" <input placeholder='transparent' class='alphaSlider' onchoice='preventSelection' type = 'number' min='0' max='1' step='0.05' "+val+" /> ");
						$t.on("change",function(k) { return function(ev)
						{
							planes[k].material.alpha = 1-$(ev.target).val();
							activateRenderLoop();

						}}(k))

 					 	$menu.append($li.append($t));
					 }
					 $menu.append($("<hr width='100%'> ")); 					 					
					 $menu.append($("<span> &nbsp Fixed planar view</span>"));
					 $menu.append($("<hr width='100%'> ")); 					 					

					 name[-1] = 'free view';
					 for (var k = -1;k <3;k++)
					 {
					 	var sel = '';
					 	if (fixedPlanarView == perm[k])
					 	  sel = 'check-';
 					 	$menu.append($("<li  onchoice='pla_"+k+"' > "+name[k]+"  <i  onchoice='pla_"+k+"' class='fa fa-"+sel+"circle-o'></i> </li>"));
					 }
					 $menu.append($("<hr width='100%'> ")); 					 					

					 var sel = '';
					 if (ViewerSettings.sync3D)
					 	  sel = 'check-';
 				 	 $menu.append($("<li  onchoice='sync' > Synchronize 3D views<i  onchoice='sync' class='fa fa-"+sel+"square-o'></i>   </li>"));

					return $menu; 
				  }, function(str,ev)
				  {
				  	  if (str == '' | str == undefined)
				  	  	return;
					  var perm = [viewer.nii.permutationOrder[0],viewer.nii.permutationOrder[1],viewer.nii.permutationOrder[2]];
					  perm[-1] = -1;


					  activateRenderLoop();
					  
					  if (str == 'sync')
					  {
					  	 if (ViewerSettings.sync3D)
					  	 	ViewerSettings.sync3D = false;
					  	 else
					  	 	ViewerSettings.sync3D = true;

					  }
					  else 	  if (str.search("vis") != -1)
				  	  {
				  	  	  str = str.substring(4);
//						  var pl = perm[parseInt(str)];
						  var pl = parseInt(str);
						  planesVisibility[pl] = !planesVisibility[pl];
						  if (planesVisibility[pl])
						  {
							planes[pl].visibility = 1;
							planes[pl].isPickable = true;
						  }
						  else
						  {
							planes[pl].visibility = -1;
							planes[pl].isPickable = false;
						  }
				  	  }
				  	  else
				  	  {
				  	  	  str = str.substring(4);
						  fixedPlanarView = parseInt(str);
						  if (fixedPlanarView != -1)
						  {
				  	  	 //     fixedPlanarView = perm[fixedPlanarView];
							  for (var pl = 0; pl < 3; pl++)
							  {
							  	planesVisibility[pl] = false;
								planes[pl].visibility = 0;
								planes[pl].isPickable = false;
							  }
							  planesVisibility[fixedPlanarView] = true;
							  planes[fixedPlanarView].visibility = 1;
							  planes[fixedPlanarView].isPickable = true;
							  if (fixedPlanarView == 1)
							  {						
								// coronal						  
								camera.alpha = Math.PI;
								camera.beta = Math.PI/2;
							  } 
							  else if (fixedPlanarView == 0)
							  {						
								// saggital					  
								camera.alpha = Math.PI/2;
								camera.beta = Math.PI/2;
							  } 
							  else if (fixedPlanarView == 2)
							  {						
								// transversal					  
								camera.alpha = Math.PI;
								camera.beta = 0;
							  }
						  }
						  else
						  {
							  for (var pl = 0; pl < 3; pl++)
							  {
							  	planesVisibility[pl] = true;							  	
								planes[pl].visibility = 1;
								planes[pl].isPickable = true;
							  }						  	
						  }


				  	  }
					  

   					  for (var k = 0; k < viewer.objects3D.length;k++)
					  {
						if (viewer.objects3D[k].updateCut != undefined)
							viewer.objects3D[k].updateCut([ planes[viewer.nii.permutationOrder[1]].visibility,
															planes[viewer.nii.permutationOrder[2]].visibility,
															planes[viewer.nii.permutationOrder[0]].visibility]);
					  }		


				  },undefined,true);






	createScene();



	function sync3DViews(a,b,px,py,zoom)
	{
		if (camera_picto)
		{
			camera_picto.alpha= viewer.gl.camera.alpha;
			camera_picto.beta= viewer.gl.camera.beta;
			camera_picto.inertialAlphaOffset = viewer.gl.camera.inertialAlphaOffset;
			camera_picto.inertialBetaOffset= viewer.gl.camera.inertialBetaOffset;
		}

		if (ViewerSettings.sync3D && KViewer.zoomedViewport == -1)
		{

			KViewer.iterateMedViewers(function(m)
			{
				if (m.nii !=undefined)
				  if (m.isGLenabled())
				  {
						if (viewer.gl.camera != m.gl.camera)
						{
							m.gl.camera.alpha = viewer.gl.camera.alpha;
							m.gl.camera.beta = viewer.gl.camera.beta;
							m.gl.camera.radius = viewer.gl.camera.radius;
							m.gl.camera.inertialAlphaOffset = a;
							m.gl.camera.inertialBetaOffset = b;
							m.gl.camera.inertialPanningX = px;
							m.gl.camera.inertialPanningY = py;
							m.gl.camera.inertialRadiusOffset = zoom;
							if (m.gl.camera_picto)
							{
								m.gl.camera_picto.alpha= viewer.gl.camera.alpha;
								m.gl.camera_picto.beta= viewer.gl.camera.beta;
								m.gl.camera_picto.inertialAlphaOffset = viewer.gl.camera.inertialAlphaOffset;
								m.gl.camera_picto.inertialBetaOffset= viewer.gl.camera.inertialBetaOffset;
							}
							m.gl.activateRenderLoop();
						}
				  }

			});
		}
	}


	 function activateRenderLoop()
	 {
		gl.lastRenderQuery = Date.now();
		gl.isidle = false;
		///console.log('activate render loop');
	 }


     var saveRender_id = setInterval(function()
     {
     	if (Date.now()-gl.lastRenderQuery > 5000)
     		gl.isidle = true;
     },500);

	engine.runRenderLoop(function () {
		if (gl.isidle)
			return;
		else
			scene.render();
	  });

//	window.addEventListener("resize",engine.resize);



	function screenShot(cb) 
	{
		return BABYLON.Tools.CreateScreenshot(engine,camera,{precision:1},cb);
	}


	function getRealWorldCoordinateFromEvent(evt)
	{
		var pickResult = scene.pick(evt.offsetX, evt.offsetY,undefined,undefined,gl.camera);	
	    var pP = gl.flip(pickResult.pickedPoint);
		var p = GL2world([pP.x,pP.y,pP.z]);	 						
		return p;

							

	}


	var gl = {engine:engine, 
	      volrender :{ctx:vol_ctxs,material:vol_materials,textures:vol_textures,planes:vol_planes},
		  getCtx:function() { return ctxs; }, 
		  getTextures:function() { return textures; },
		  scene:scene,
		  texSize:texSize,
		  camera:camera,
		  getRealWorldCoordinateFromEvent:getRealWorldCoordinateFromEvent,
		  camera_picto:camera_picto,
		  planes:planes,
		  isidle:false,
		  lastRenderQuery:Date.now(),
		  screenShot:screenShot,
		  doDownload:doDownload,
		  activateRenderLoop:activateRenderLoop,
		  createMarkerMesh:createMarkerMesh,
		  createTrace:createTrace,
		  createElectrode:createElectrode,
		  updateLayout:updateLayout,
		  updateObjects:updateObjects,
		  updatePlanes:updatePlanes,
		  grandParent:grandParent,
		  sync3DViews:sync3DViews,
		  setPlanesVisibility: setPlanesVisibility,
		  getPlanesVisibility: getPlanesVisibility,
		  isFixed:function() {return fixedPlanarView!=-1},
		  createPencil:createPencil,
		  setPencilProps:setPencilProps,
		  makePencilPickable:makePencilPickable,
		  disposePencil:disposePencil,
		  disposePlanes:disposePlanes,
		  createPlanes:createPlanes,
		  animate3D:animate3D,
		  setSurfColor:setSurfColor,
		  createControlsCam:createControlsCam,
		  modifyFibersByPick:modifyFibersByPick,
		  createSurface:createSurface,
		  createFreeSurf:createFreeSurf,
		  createConmat:createConmat,
		  createContour:createContour,
		  createFiberBundle:createFiberBundle,
		  createFiberShader:createFiberShader,
		  flip:flip,
		  setQuality:setQuality,
		  detachShader:detachShader,
		  selectionRadius:viewer.computeMaxExtentFac()*0.05,
		  slice:slice,
		  dispose:dispose,
		  GL2world:GL2world,
		  GL2world_withflip:GL2world_withflip,
		  world2GL:world2GL,
		  world2GL_matrix:world2GL_matrix,
		  world2GL_BJS_matrix:world2GL_BJS_matrix,

		  planesVisContextMenu:planesVisContextMenu,
		  updateTexture:function()
			{
				for (var k=0;k<textures.length;k++)
				 textures[k].update();
			} ,
		  updateVolume:function()
			{
				for (var k=0;k<vol_planes.length;k++)
				  if (vol_planes[k] != undefined)
				 	vol_textures[k].update();
			} ,
		  setprops:function(gl_props)
		  {
				if (gl_props)
				{
					if(gl_props.alpha != undefined)
						camera.alpha =  gl_props.alpha; 
					if(gl_props.beta != undefined)
						camera.beta =   gl_props.beta; 
					if(gl_props.radius != undefined)
						camera.radius = gl_props.radius; 
					if(gl_props.planesVisibility != undefined) 
						setPlanesVisibility(gl_props.planesVisibility);    
				}
		  	
		  }

	};

	return gl;

}




//////////////////////////////////////////////////////////////////////////////////////////////
//////////////////////// Event Managers
/////////////////////////////////////////////////////////////////////////////////////////////





function ArcRotateCameraPointersInput(cam,viewer,viewer3D) {
	this.angularSensibilityX = 1000.0;
	this.angularSensibilityY = 1000.0;
	this.pinchPrecision = 6.0;
	this.panningSensibility = 50.0;
	this._isRightClick = false;
	this._isCtrlPushed = false;
	this._isShiftPushed = false;
	this._isAltPushed = false;
	this.pinchInwards = true;
	this.camera = cam;
	this.scene = cam.getScene();
	this.viewer = viewer;
	this.viewer3D = viewer3D;

}


function dragController(viewer,obj,move,drop)
{
	var that = {};
	that.dragStart = function()
	{
		if (dragController.controller == undefined)
		{
			obj.isPickable = false;
			dragController.controller = {dragMove:that.dragMove, dropUp:that.dropUp};
		}
	}
	that.dragMove = function (evt,scene)
	{
		var pickResult = scene.pick(evt.offsetX, evt.offsetY,undefined,undefined,viewer.gl.camera);	
		if (pickResult.pickedMesh)
		{
		   obj.position = viewer.gl.flip(pickResult.pickedPoint);
		   if (move != undefined)
		   	  move(obj.position ,evt);
		}
	}
	that.dropUp = function (evt,scene)
	{
		obj.isPickable = true;
		dragController.controller = undefined;
		if (drop != undefined)
			drop(obj.position,evt)
	}

	return that;
}
dragController.controller = undefined;



function HoverController(scene,_this)
{
	var that = {};
	that.hoveredObj = undefined;
	that.onMove = function(evt)
	{
		var pickResult = scene.pick(evt.offsetX, evt.offsetY,undefined,undefined,_this.viewer.gl.camera);   
		if (pickResult.pickedMesh != that.hoveredObj)
		{
			if (that.hoveredObj != undefined)
			{
				if (that.hoveredObj.onHoverLeave != undefined)
					that.hoveredObj.onHoverLeave(evt);
			}
			that.hoveredObj = pickResult.pickedMesh;
			if (that.hoveredObj != undefined)
			{
				if (that.hoveredObj.onHoverEnter != undefined)
					that.hoveredObj.onHoverEnter(evt);				
				
			}
		}
	}
	return that;

}




ArcRotateCameraPointersInput.prototype.attachControl = function (element, noPreventDefault) {

	var _this = this;
	var engine = this.camera.getEngine();
	var cacheSoloPointer; // cache pointer object for better perf on camera rotation
	var pointA, pointB;
	var lastMousePos;
	var lastPickedPoint;
	this.draggedPlane = undefined;
	var draggedPlaneStart;
	var previousPinchDistance = 0;
	var lastMove = false;
	var hoverController = HoverController(_this.scene,_this);

	// ignore picks on non visible parts of the three main slices
	function pick_noTransparent(x,y)
			{
				if (_this.viewer.gl.planes[0] == undefined)
					return;
				_this.viewer.gl.planes[0].isPickable = true;
				_this.viewer.gl.planes[1].isPickable = true;
				_this.viewer.gl.planes[2].isPickable = true;

				return pick_();

				function pick_()
				{
					var pickResult = _this.scene.pick(x,y,undefined,undefined,_this.viewer.gl.camera);
					if (pickResult.pickedMesh == undefined)
						return pickResult;
					if (pickResult.pickedMesh.id.substring(0,6) == 'ground')
					{
						var notTransparent = _this.viewer.getValueAtWorldPosition(_this.viewer.gl.GL2world_withflip(pickResult.pickedPoint));						
						notTransparent = notTransparent && pickResult.pickedMesh.visibility==1;
						if (!notTransparent)
						{
							pickResult.pickedMesh.isPickable = false;
							return pick_();
						}
						else
							return pickResult;
					}
					else
						return pickResult;
				}
			}


		function updateInfo3D(pickResult,evt)
		{
			if (_this.viewer.info3D != undefined)
			{
			 _this.viewer.info3D.remove();
			}
			
			if (pickResult.pickedMesh != undefined)
			{
				if(_this._isCtrlPushed  && !_this._isShiftPushed)
				{
				   var c_val = _this.viewer.currentValueAt3DWorldPick;
				   var c_point = _this.viewer.currentCoordinateAt3DWorldPick;
				   if (c_point == undefined)
					   return;

				   var $info3D =  $("<div class='Kinfo3D'> "
				   +c_point[0].toFixed(1)+ "," 
				   +c_point[1].toFixed(1)+ "," 
				   +c_point[2].toFixed(1)+ " (mm) <br> " 
				   + "value: " + c_val + "" 
				   + "</div>").appendTo(_this.viewer.$container);
				   _this.viewer.info3D = $info3D;
				   $info3D.css('top',evt.offsetY+10);
				   $info3D.css('left',evt.offsetX+10);
				}
				else if (_this._isShiftPushed | 
				    ( _this._isShiftPushed & _this._isCtrlPushed ) | ( _this._isAltPushed ) )
				{
            		var fibs = _this.viewer.getCurrentFiberView();
            		if (fibs != undefined)
            		{

            			  var txt ;
            			  if (_this._isShiftPushed) 
            			    txt = "select fibers"
            			  if ( _this._isShiftPushed & _this._isCtrlPushed )
            			    txt = "append fibers"
            		      if ( _this._isAltPushed )
            			    txt = "select from<br>subset"

						   var $info3D =  $("<div class='Kinfo3D'> "+txt+" </div>").appendTo(_this.viewer.$container);
						   _this.viewer.info3D = $info3D;
						   $info3D.css('top',evt.offsetY+10);
						   $info3D.css('left',evt.offsetX+10);


            		}
					
				}
			}
		}
         




	this._pointerInput = (function (p, s) {
		var evt = p.event;
		if (p.type === BABYLON.PointerEventTypes.POINTERDOWN) {
			try {
				evt.srcElement.setPointerCapture(evt.pointerId);
			}
			catch (e) {
			}

			_this._isRightClick = evt.button === 2;
			
			function default_rotate()
			{                    

				_this.viewer.gl.activateRenderLoop();
	
				// Manage panning with right click
				_this._isRightClick = evt.button === 2;
				// manage pointerss
				cacheSoloPointer = { x: evt.clientX, y: evt.clientY, pointerId: evt.pointerId, type: evt.pointerType };
				if (pointA === undefined) {
					pointA = cacheSoloPointer;
				}
				else if (pointB === undefined) {
					pointB = cacheSoloPointer;
				}
				if (!noPreventDefault) {
					evt.preventDefault();
				}
			}

			
			var pickResult = pick_noTransparent(evt.offsetX, evt.offsetY);
			if (pickResult == undefined)
				return;


			if (pickResult.pickedMesh != null)
			{

				 var markerEditmode = markerProxy.currentSet != undefined 
				 						  && KViewer.markerTool.enabled
										  && markerProxy.currentSet.state
										  && !markerProxy.currentSet.state.locked
										  && markerProxy.currentSet.state.createonclick
										  && markerProxy.currentSet.type != "electrode";

				if (pickResult.pickedMesh.onmousedown != undefined)
				{
					pickResult.pickedMesh.onmousedown(evt,pickResult,_this);
				}

				if (markerEditmode && pickResult !=undefined && pickResult.pickedMesh !=undefined&& pickResult.pickedMesh.after!=undefined)
				{
						var p1 = _this.viewer.gl.flip(pickResult.pickedPoint);
 				    	p1 = _this.viewer3D.GL2world([p1.x,p1.y,p1.z]);	
 				    	var po = markerProxy.currentSet.insertpoint(p1._data,undefined,pickResult.pickedMesh.after,{size:markerProxy.currentSet.state.defaultradius});
						markerProxy.currentSet.updateLine();
						KViewer.markerTool.update()
				}
				else if (pickResult.pickedMesh.dragController != undefined && !_this._isRightClick
						&& (pickResult.pickedMesh.id!="marker" || !markerProxy.currentSet.state.locked)   )
				{
					pickResult.pickedMesh.dragController.dragStart();
				}
				else if (_this._isShiftPushed)
				{
					if (_this.viewer.currentROI != undefined)
					{
			            KViewer.roiTool.history.record('startRecording', _this.viewer);   		
			            var pP = _this.viewer.gl.flip(pickResult.pickedPoint);
 						var p = _this.viewer3D.GL2world([pP.x,pP.y,pP.z]);	 						
						if (KViewer.roiTool.regionGrow |  KViewer.roiTool.regionGrowRestric)
							regionGrow.changedPoints = [];
						if (KViewer.roiTool.regionGrow)
						{
							KViewer.roiTool.drawPen(evt,_this.viewer); 
							KViewer.roiTool.$pencil.addClass('leftright busy');
							regionGrow.helper.simscaling = 0; 						
							regionGrow.helper.p = p;
							regionGrow.helper.downev = evt;
						}
						KViewer.roiTool.modifyRoiInternal(p,evt.button==0,_this.viewer.gl.slice(pickResult,true), _this.viewer,undefined,function(changedPoints) {
						
							if (KViewer.roiTool.regionGrow)
							{
								_this.viewer.gl.disposePencil();
								KViewer.roiTool.$pencil.removeClass('busy');
							}
							else
								KViewer.roiTool.history.add(changedPoints, evt.button==0);

							signalhandler.send("positionChange");
							pointA = {};
							_this._roiPainted = true;
						});
					}
					else if (!_this._isRightClick && markerEditmode)
 				    {
						var p1 = _this.viewer.gl.flip(pickResult.pickedPoint);
 				    	p1 = _this.viewer3D.GL2world([p1.x,p1.y,p1.z]);	
 				    	var po;
 				    	if (pickResult.pickedMesh.after != undefined)
 				    	   po = markerProxy.currentSet.insertpoint(p1._data,undefined,pickResult.pickedMesh.after,{size:markerProxy.currentSet.state.defaultradius});
 				    	else
						   po = markerProxy.currentSet.addpoint(p1._data,undefined,{size:markerProxy.currentSet.state.defaultradius});
						KViewer.markerTool.update()
						
					}
					else if (_this._isRightClick && markerEditmode)
 				    {
						if (pickResult &&  pickResult.pickedMesh && pickResult.pickedMesh.point)
						{
							pickResult.pickedMesh.point.deletepoint();
							KViewer.markerTool.update()
						}
						
					}
					else
					{
						lastPickedPoint=pickResult;
						if (_this._isAltPushed)
						    _this.viewer.gl.modifyFibersByPick(pickResult,_this,'subselect');
						else if (_this._isRightClick)
							_this.viewer.gl.modifyFibersByPick(pickResult,_this,'delete');
						else if (_this._isCtrlPushed)
							_this.viewer.gl.modifyFibersByPick(pickResult,_this,'append');
						else						
							_this.viewer.gl.modifyFibersByPick(pickResult,_this,'select');
						pointA = {};
					}
				}
				else if (_this._isCtrlPushed | pickResult.pickedMesh.id == "planecontroller")
				{
 					if (pickResult.pickedMesh.id == "planecontroller")
 						_this.draggedPlane = pickResult.pickedMesh.parent; 					
					else
 						_this.draggedPlane = pickResult.pickedMesh;
 					var v = _this.viewer.getCurrenVoxel();
 					draggedPlaneStart = [evt.offsetX,evt.offsetY,v._data[0],v._data[1],	v._data[2]];
				}
				else if (_this._isRightClick & pickResult.pickedMesh.contextmenu != undefined)
				{
						 						
					pickResult.pickedMesh.contextmenu(evt,pickResult,_this);
				}
				else if (_this._isRightClick & pickResult.pickedMesh.id=='marker'
 						  && markerProxy.currentSet != undefined 
						  && markerProxy.currentSet.state
						  && !markerProxy.currentSet.state.locked
						  && markerProxy.currentSet.state.createonclick
						  && markerProxy.currentSet.type != "electrode")
				{
					pickResult.pickedMesh.point.deletepoint()
				}
				else
					default_rotate();
			}
			else	
				default_rotate();			



		}
		else if (p.type === BABYLON.PointerEventTypes.POINTERUP) {
			try {
				evt.srcElement.releasePointerCapture(evt.pointerId);
			}
			catch (e) {
			}
			_this.draggedPlane = null;
			cacheSoloPointer = null;
			previousPinchDistance = 0;
			//would be better to use pointers.remove(evt.pointerId) for multitouch gestures, 
			//but emptying completly pointers collection is required to fix a bug on iPhone : 
			//when changing orientation while pinching camera, one pointer stay pressed forever if we don't release all pointers  
			//will be ok to put back pointers.remove(evt.pointerId); when iPhone bug corrected
			pointA = pointB = undefined;
			if (!noPreventDefault) {
				evt.preventDefault();
			}

			var pickResult = _this.scene.pick(evt.offsetX, evt.offsetY,undefined,undefined,_this.viewer.gl.camera);
			if (pickResult.pickedMesh != undefined )
				if (pickResult.pickedMesh.onmouseup != undefined)
					pickResult.pickedMesh.onmouseup(evt,pickResult,_this);

			if (_this._roiPainted & _this.viewer.currentROI != undefined)
			{

					if (KViewer.roiTool.regionGrow)
					{						
						if (regionGrow.timeout != -1)
						{
							clearTimeout(regionGrow.timeout);
							regionGrow.timeout = -1;
							alertify.error('region growing breaked to early, keep mouse down to produce full result')
						}							
						KViewer.roiTool.history.add(regionGrow.changedPoints,  evt.button==0);
						KViewer.roiTool.hidePen(_this.viewer);
						KViewer.roiTool.$pencil.removeClass('leftright '); 
						KViewer.roiTool.update3D(_this.viewer.currentROI)				
					}
					else
						KViewer.roiTool.update3D(_this.viewer.currentROI)				

			}
		

			if (dragController.controller != undefined)
			{			
				dragController.controller.dropUp(evt,_this.scene);				
			}
			_this._roiPainted = false;

		    if (_this.viewer.info3D != undefined)
		      _this.viewer.info3D.remove();



		}
		else if (p.type === BABYLON.PointerEventTypes.POINTERMOVE) {
			if (!noPreventDefault) {
				evt.preventDefault();
			}
		  evt = $.extend({},evt);

		  var thehandler = function() {
			hoverController.onMove(evt);

		


			var pickResult = pick_noTransparent(evt.offsetX, evt.offsetY);

			if (pickResult == undefined)
				return;

			if (pickResult.pickedMesh != undefined )
				if (pickResult.pickedMesh.onmousemove != undefined)
					pickResult.pickedMesh.onmousemove(evt,pickResult,_this);
	

			updateInfo3D(pickResult,evt);



	        if (_this._isShiftPushed)
	        {
			    _this.viewer.gl.setPencilProps(pickResult);
			    if (KViewer.roiTool.regionGrow)			
			   		KViewer.roiTool.drawPen(evt,_this.viewer); 
	        }







			lastMousePos = {x:evt.offsetX,y:evt.offsetY,cx:evt.clientX,cy:evt.clientY};

			// One button down
			if (dragController.controller != undefined)
			{			
				dragController.controller.dragMove(evt,_this.scene);
			}
			else if (_this._isAltPushed )
			{
				/*
				if (lastPickedPoint)
				{
					_this.viewer.gl.makePencilPickable();
					var p1 = _this.viewer.gl.flip(pickResult.pickedPoint);
					var p2 = _this.viewer.gl.flip(lastPickedPoint.pickedPoint);
					p1 = _this.viewer3D.GL2world([p1.x,p1.y,p1.z]);	
					p2 = _this.viewer3D.GL2world([p2.x,p2.y,p2.z]);	

					p1._data[0] -= p2._data[0];
					p1._data[1] -= p2._data[1];
					p1._data[2] -= p2._data[2];

					_this.viewer.gl.modifyFibersByPick(lastPickedPoint,_this,'select',p1);
				}*/
			}
			else if (_this._isShiftPushed && pointA && pointB === undefined)
			{
					if ( _this.viewer.currentROI != undefined && pickResult.pickedPoint != undefined)
					{
						var pP = _this.viewer.gl.flip(pickResult.pickedPoint);
 						var p = _this.viewer3D.GL2world([pP.x,pP.y,pP.z]);	 						

						if (!KViewer.roiTool.regionGrow)
						{
 							KViewer.roiTool.modifyRoiInternal(p,evt.buttons==1,_this.viewer.gl.slice(pickResult,true), _this.viewer,undefined,function(changedPoints)
 							{
								KViewer.roiTool.history.add(changedPoints, evt.buttons==1);
		 						signalhandler.send("positionChange");

 							});
						}
						else
						{
							regionGrow.helper.simscaling = evt.clientX-regionGrow.helper.downev.clientX;
							KViewer.roiTool.$pencil.addClass('leftright busy');
							KViewer.roiTool.modifyRoiInternal(regionGrow.helper.p,evt.buttons==1,_this.viewer.gl.slice(pickResult,true), _this.viewer,undefined,function(changedPoints)
							{
								KViewer.roiTool.drawPen(evt,_this.viewer); 
								KViewer.roiTool.$pencil.removeClass('busy');
		 						signalhandler.send("positionChange");
							});
						} 					

					}
					else
					{
						lastPickedPoint=pickResult;
						if (_this._isCtrlPushed | _this._isRightClick)
							_this.viewer.gl.modifyFibersByPick(pickResult,_this,'delete');
						else
							_this.viewer.gl.modifyFibersByPick(pickResult,_this,'select');
					}
			}
			else if	(_this.draggedPlane)
			{
				var speed = 0.3;
				var i= [0,1,2]; i[_this.viewer.nii.permutationOrder[0]] = 0;  i[_this.viewer.nii.permutationOrder[1]] = 1; i[_this.viewer.nii.permutationOrder[2]] = 2;					
				var s = _this.viewer.nii.arrayReadDirection;
				var dif = [(-evt.offsetX+draggedPlaneStart[0]),(-evt.offsetY+draggedPlaneStart[1])];
                var camdir = _this.camera.globalPosition;
				if (_this.draggedPlane.id == "ground0")
					_this.viewer.setSlicePos(i[0],speed*s[i[0]]*dif[0]*Math.sign(camdir.x)+draggedPlaneStart[i[0]+2]);
				else if (_this.draggedPlane.id == "ground1")
					_this.viewer.setSlicePos(i[1],speed*s[i[1]]*dif[0]*Math.sign(camdir.z) +draggedPlaneStart[i[1]+2]);
				if (_this.draggedPlane.id == "ground2")
					_this.viewer.setSlicePos(i[2],speed*s[i[2]]*dif[1]*Math.sign(camdir.y)  +draggedPlaneStart[i[2]+2]);
			}
			else if (pointA && pointB === undefined) {
				if (_this.panningSensibility !== 0 &&
					((_this._isCtrlPushed && _this.camera._useCtrlForPanning) ||
						(!_this.camera._useCtrlForPanning && _this._isRightClick))) {
					_this.camera.inertialPanningX += -(evt.clientX - cacheSoloPointer.x) / _this.panningSensibility;
					_this.camera.inertialPanningY += (evt.clientY - cacheSoloPointer.y) / _this.panningSensibility;
					_this.viewer.gl.sync3DViews(_this.camera.inertialAlphaOffset,_this.camera.inertialBetaOffset,
													_this.camera.inertialPanningX,_this.camera.inertialPanningY,_this.camera.inertialRadiusOffset );
					_this.viewer.gl.activateRenderLoop();
				}
				else {
					if (cacheSoloPointer != undefined & !_this.viewer.gl.isFixed())
					{
						var offsetX = evt.clientX - cacheSoloPointer.x;
						var offsetY = evt.clientY - cacheSoloPointer.y;
						_this.camera.inertialAlphaOffset -= offsetX / _this.angularSensibilityX;
						_this.camera.inertialBetaOffset -= offsetY / _this.angularSensibilityY;
						_this.viewer.gl.activateRenderLoop();
  					    _this.viewer.gl.sync3DViews(_this.camera.inertialAlphaOffset,_this.camera.inertialBetaOffset,
  					    								_this.camera.inertialPanningX,_this.camera.inertialPanningY,_this.camera.inertialRadiusOffset );

					}
				}
				if (cacheSoloPointer != null)
				{
					cacheSoloPointer.x = evt.clientX;
					cacheSoloPointer.y = evt.clientY;
				}
			}
			else if (pointA && pointB) {
				//if (noPreventDefault) { evt.preventDefault(); } //if pinch gesture, could be useful to force preventDefault to avoid html page scroll/zoom in some mobile browsers
				var ed = (pointA.pointerId === evt.pointerId) ? pointA : pointB;
				ed.x = evt.clientX;
				ed.y = evt.clientY;
				var direction = _this.pinchInwards ? 1 : -1;
				var distX = pointA.x - pointB.x;
				var distY = pointA.y - pointB.y;
				var pinchSquaredDistance = (distX * distX) + (distY * distY);
				if (previousPinchDistance === 0) {
					previousPinchDistance = pinchSquaredDistance;
					return;
				}
				if (pinchSquaredDistance !== previousPinchDistance) {
					_this.camera
						.inertialRadiusOffset += (pinchSquaredDistance - previousPinchDistance) /
						(_this.pinchPrecision *
							((_this.angularSensibilityX + _this.angularSensibilityY) / 2) *
							direction);
					previousPinchDistance = pinchSquaredDistance;
				}
			}
		  }

		  if (!(/Firefox/i.test(navigator.userAgent)))
			thehandler()
		  else
		  {
			  setTimeout(thehandler,0);
			  lastMove=true;
			  setTimeout(function() { lastMove = false; },10);
		  }
        

		}
	});
	this._observer = this.camera.getScene().onPointerObservable.add(this._pointerInput, BABYLON.PointerEventTypes.POINTERDOWN | BABYLON.PointerEventTypes.POINTERUP | BABYLON.PointerEventTypes.POINTERMOVE);
	this._onContextMenu = function (evt) {
		evt.preventDefault();
	};
	if (!this.camera._useCtrlForPanning) {
		element.addEventListener("contextmenu", this._onContextMenu, false);
	}
	this._onLostFocus = function () {
		//this._keys = [];
		pointA = pointB = undefined;
		previousPinchDistance = 0;
		cacheSoloPointer = null;
	};
	this._onKeyDown = function (evt) {
		if (!_this.viewer.isGLenabled())
			return;
		if (!_this.mouseOnViewer)
			return;
		

		_this._isCtrlPushed = evt.ctrlKey;
		_this._isShiftPushed = evt.shiftKey;
		_this._isAltPushed = evt.altKey;
		var fibs = _this.viewer.getCurrentFiberView();
		
		if (_this._isShiftPushed & lastMousePos != undefined)
		{
			 
			if (lastMousePos != undefined)
			{
				evt.clientX = lastMousePos.cx;
				evt.clientY = lastMousePos.cy;
				evt.offsetX = lastMousePos.x;
				evt.offsetY = lastMousePos.y;
			}
			if (KViewer.roiTool.regionGrow)
				KViewer.roiTool.drawPen(evt,_this.viewer); 			

		    var pickResult = _this.scene.pick(lastMousePos.x,lastMousePos.y,undefined,undefined,_this.viewer.gl.camera);
			if (pickResult.pickedMesh != null && (_this.viewer.currentROI != undefined | fibs != undefined))
 			{
				_this.viewer.gl.createPencil()
				if (pickResult.pickedMesh.name != 'marker')
				{
					_this.viewer.gl.createPencil()
				}
				_this.viewer.gl.setPencilProps(pickResult);
				
 			}
    		updateInfo3D(pickResult,evt);

		}
		else if (_this._isCtrlPushed)
		{
            
            for (var k=0;k <_this.viewer.objects3D.length;k++)
            { 
                if (_this.viewer.objects3D[k].gl && _this.viewer.objects3D[k].gl.largeMesh)
                    _this.viewer.objects3D[k].gl.isPickable = true;
            }

			if (lastMousePos != undefined)
			{
				var pickResult = _this.scene.pick(lastMousePos.x,lastMousePos.y,undefined,undefined,_this.viewer.gl.camera);
				evt.offsetX = lastMousePos.x
				evt.offsetY = lastMousePos.y

				updateInfo3D(pickResult,evt);
			}
		}

		
	/*	else if (_this._isAltPushed)
		{
	
			if (lastPickedPoint != undefined && lastPickedPoint.pickedMesh != null)
 			{
				_this.viewer.gl.createPencil(undefined,true);
				//if (lastPickedPoint.pickedMesh.name != 'marker')
				//		_this.viewer.gl.setPencilProps(lastPickedPoint);
				
 			}
		}
		*/

	};
	this._onKeyUp = function (evt) {
		if (!_this.viewer.isGLenabled())
			return;
	
		if (!_this.mouseOnViewer)
			return;
		_this._isAltPushed = evt.altKey;
		_this._isCtrlPushed = evt.ctrlKey;
		_this._isShiftPushed = evt.shiftKey;

		if (_this.viewer.info3D != undefined)
		  _this.viewer.info3D.remove();

		KViewer.roiTool.hidePen(_this.viewer); 

        if  (evt.code == 'ControlLeft')
        {
            for (var k=0;k <_this.viewer.objects3D.length;k++)
            { 
                if (_this.viewer.objects3D[k].gl && _this.viewer.objects3D[k].gl.largeMesh)
                    _this.viewer.objects3D[k].gl.isPickable = false;
            }
        }

	 
		if (_this.viewer.gl )
		{
			_this.viewer.gl.disposePencil();
			if (!_this._isCtrlPushed & !_this._isShiftPushed)
				_this.viewer.gl.disposePencil();
			else
			{
				_this.viewer.gl.createPencil("sphere",true);
				if (lastMousePos)
				{
					var pickResult = _this.scene.pick(lastMousePos.x,lastMousePos.y,undefined,undefined,_this.viewer.gl.camera);
					_this.viewer.gl.setPencilProps(pickResult);		    
				}
			}
		}

	};
	this._onMouseMove = function (evt) {
		_this.mouseOnViewer = true;
		if (!engine.isPointerLock) {
			return;
		}
		var offsetX = evt.movementX || evt.mozMovementX || evt.webkitMovementX || evt.msMovementX || 0;
		var offsetY = evt.movementY || evt.mozMovementY || evt.webkitMovementY || evt.msMovementY || 0;
		_this.camera.inertialAlphaOffset -= offsetX / _this.angularSensibilityX;
		_this.camera.inertialBetaOffset -= offsetY / _this.angularSensibilityY;
		if (!noPreventDefault) {
			evt.preventDefault();
		}
	};
	this._onMouseLeave = function (evt) {
		_this.mouseOnViewer = false;
		if (!engine.isPointerLock) {
	//		return;
		}
		if (_this.viewer.info3D != undefined)
		  _this.viewer.info3D.remove();

	    pointA = pointB = undefined;
		previousPinchDistance = 0;
		cacheSoloPointer = null;
		_this._isCtrlPushed = false;
		_this._isShiftPushed = false;
		if (_this.viewer.gl != undefined)
			_this.viewer.gl.disposePencil();

		if (!noPreventDefault) {
			evt.preventDefault();
		}
	};
	this._onGestureStart = function (e) {
		if (window.MSGesture === undefined) {
			return;
		}
		if (!_this._MSGestureHandler) {
			_this._MSGestureHandler = new MSGesture();
			_this._MSGestureHandler.target = element;
		}
		_this._MSGestureHandler.addPointer(e.pointerId);
	};
	this._onGesture = function (e) {
		_this.camera.radius *= e.scale;
		if (e.preventDefault) {
			if (!noPreventDefault) {
				e.stopPropagation();
				e.preventDefault();
			}
		}
	};
	this._wheel = (function (event) {

 		if (KViewer.zoomedViewport != -1 & !_this.viewer.viewport.isZoomed())
            return;


		
	    event = window.event || event; // old MOZ support
		_this.viewer.gl.activateRenderLoop();
  	
		if (event.shiftKey)
		{
			function c(amount)
			{
				var fac = 0.8;
				if (KViewer.defaultFOV_mm)
					fac = KViewer.defaultFOV_mm/100;
				return fac*((amount>0)?1:-1);
			}
			var amount = (event.wheelDelta || -event.detail);							
			var pickResult = _this.scene.pick(event.offsetX, event.offsetY,undefined,undefined,_this.viewer.gl.camera);
			if (pickResult.pickedMesh != undefined && pickResult.pickedMesh.point != undefined)
			{
				pickResult.pickedMesh.point.incsize(c(amount));
			}
			else if (_this.viewer.currentROI != undefined)
			{
				KViewer.roiTool.pensizechange({myScrollAmount:c(amount)}, "radius", _this.viewer);
				_this.viewer.gl.setPencilProps(pickResult);
			}
			else if (_this.viewer.getCurrentFiberView() != undefined)
			{
				
				_this.viewer.gl.selectionRadius += c(amount)* _this.viewer.computeMaxExtentFac()*0.002;
				if (_this.viewer.gl.selectionRadius < 0.1) 
					_this.viewer.gl.selectionRadius = 0.1;
				if (pickResult.pickedMesh != undefined)
					_this.viewer.gl.setPencilProps(pickResult);
				if (pointA)
				{
					if (_this._isCtrlPushed)
						_this.viewer.gl.modifyFibersByPick(pickResult,_this,'delete');					
					else
						_this.viewer.gl.modifyFibersByPick(pickResult,_this,'select');					
				}						    
		
			}
		//	event.preventDefault();
		//    event.stopPropagation();

		}
		else if (event.ctrlKey)
		{
			var delta = 0;
			if (event.wheelDelta != undefined) {
				delta = event.wheelDelta / (_this.camera.wheelPrecision * 40);
			}
			else if (event.detail != undefined) {
				delta = -event.detail / _this.camera.wheelPrecision;
			}
			if (delta)
			{
				_this.camera.inertialRadiusOffset += delta*_this.viewer.getMinVoxSize();				
				_this.viewer.gl.sync3DViews(_this.camera.inertialAlphaOffset,_this.camera.inertialBetaOffset,
							_this.camera.inertialPanningX,_this.camera.inertialPanningY,_this.camera.inertialRadiusOffset );
			}
			
			setTimeout(_this.viewer.gl.setQuality,350);
		//	event.preventDefault();
		//	event.stopPropagation();

		}
		else
		{
			var pickResult = _this.scene.pick(event.offsetX, event.offsetY,undefined,undefined,_this.viewer.gl.camera);
			if (pickResult.pickedMesh)
			{
				var i= [[0,1,2]]; i[_this.viewer.nii.permutationOrder[0]] = 0;  i[_this.viewer.nii.permutationOrder[1]] = 1; i[_this.viewer.nii.permutationOrder[2]] = 2;					
				var amount = (event.wheelDelta || -event.detail)/800;							
				_this.viewer.handleSliceChange(_this.viewer.gl.slice(pickResult,true),amount);
			//	event.preventDefault();
			//    event.stopPropagation();
			
			}
		
		}
		event.returnValue = false;
	    return false;
	});
	element.addEventListener("mouseleave", this._onMouseLeave, false);
//	element.addEventListener("mousemove", moveUnlagger(this._onMouseMove,'cloneEvent'), false);
	element.addEventListener("mousemove", this._onMouseMove, false);
	element.addEventListener("MSPointerDown", this._onGestureStart, false);
	element.addEventListener("MSGestureChange", this._onGesture, false);
	
	if (/Firefox/i.test(navigator.userAgent))
	{
		 this._wheel = moveUnlagger(this._wheel,'cloneEvent')
		 element.addEventListener( "DOMMouseScroll", this._wheel);	 
	}
	else
	{
         element.addEventListener( "mousewheel", this._wheel);	
	}
    //var mousewheelevt=(/Firefox/i.test(navigator.userAgent))? "DOMMouseScroll" : "mousewheel" //FF doesn't recognize mousewheel as of FF3.x
	//element.addEventListener(mousewheelevt, this._wheel);


	BABYLON.Tools.RegisterTopRootEvents([
		{ name: "keydown", handler: this._onKeyDown },
		{ name: "keyup", handler: this._onKeyUp },
		{ name: "blur", handler: this._onLostFocus }
	]);

	return this;


};
ArcRotateCameraPointersInput.prototype.detachControl = function (element) {
	if (element && this._observer) {
		this.camera.getScene().onPointerObservable.remove(this._observer);
		this._observer = null;
		element.removeEventListener("contextmenu", this._onContextMenu);
		element.removeEventListener("mousemove", this._onMouseMove);
		element.removeEventListener("mouseleave", this._onMouseLeave);
		element.removeEventListener("MSPointerDown", this._onGestureStart);
		element.removeEventListener("MSGestureChange", this._onGesture);
		element.removeEventListener("mousewheel", this._wheel, false);

		this._isRightClick = false;
		this._isCtrlPushed = false;
		this.pinchInwards = true;
		this._onKeyDown = null;
		this._onKeyUp = null;
		this._onMouseMove = null;
		this._onGestureStart = null;
		this._onGesture = null;
		this._MSGestureHandler = null;
		this._onLostFocus = null;
		this._onContextMenu = null;
	}
	BABYLON.Tools.UnregisterTopRootEvents([
		{ name: "keydown", handler: this._onKeyDown },
		{ name: "keyup", handler: this._onKeyUp },
		{ name: "blur", handler: this._onLostFocus }
	]);
};
ArcRotateCameraPointersInput.prototype.getTypeName = function () {
	return "ArcRotateCameraPointersInput";
};
ArcRotateCameraPointersInput.prototype.getSimpleName = function () {
	return "pointers";
};







function initBabylon(onBabylon)
{

     scriptLoader.loadScript('babylon.js', function() { 

     scriptLoader.loadScript('babylon.objFileLoader.js', function() { 




	BABYLON.Effect.ShadersStore.fiberColorVertexShader = "precision highp float;"+
	"attribute vec3 position;"+
	"attribute vec4 color;"+
	"varying vec4 vcolor;"+
	"varying vec4 ptmp;"+
	"uniform mat4 worldViewProjection;"+
	"uniform mat4 worldToVoxel;"+
	"uniform vec3 planesPos;" +
	"uniform float planesNum;" +
	"uniform float planesThres;" +
	"uniform float planesProj;" +
	"void main(void) { vcolor = color;"+
	"   ptmp = worldToVoxel * vec4(position,1.0);"+
	"   if (planesNum < 0.0) { " +
		"	    gl_Position = worldViewProjection * ptmp; } "+
	"   else if (planesNum < 0.5) { " +
		"   if (sign(planesThres)*abs(ptmp[0]-planesPos[0]) <  planesThres) { "+
		"       if (planesProj > 0.0) ptmp[0] = planesPos[0]; " + 
		"	    gl_Position = worldViewProjection * ptmp; } "+
		"   else { " + 
		"       gl_Position = vec4(0.0,0.0,1000000000000.0,0.0);  } } " + 
	"   else if (planesNum < 1.5) { " +
		"   if (sign(planesThres)*abs(ptmp[1]-planesPos[1]) <  planesThres) { "+
		"       if (planesProj > 0.0) ptmp[1] = planesPos[1]; " + 
		"	    gl_Position = worldViewProjection * ptmp; } "+
		"   else { " + 
		"       gl_Position = vec4(0.0,0.0,1000000000000.0,0.0);  } } " + 
	"   else { " +
		"   if (sign(planesThres)*abs(ptmp[2]-planesPos[2]) <  planesThres) { "+
		"       if (planesProj > 0.0) ptmp[2] = planesPos[2]; " + 
		"	    gl_Position = worldViewProjection * ptmp; } "+
		"   else { " + 
		"       gl_Position = vec4(0.0,0.0,1000000000000.0,0.0);  } } " + 
	"}";


	BABYLON.Effect.ShadersStore.fiberColorPixelShader = "precision highp float;"+
	"varying vec4 vcolor; uniform vec4 col; uniform float alpha; uniform float hover; float tex; float tox=0.7; void main(void) {"+
	" if (col[3]==0.0) "+
			" { gl_FragColor = vcolor;  }  "+
	" else {gl_FragColor = col; tex = 0.3*(vcolor[3]-0.5);  "+
			 "  gl_FragColor[0] = vcolor[0]*(1.0-tox)+gl_FragColor[0]*tox+tex; "+
			 "  gl_FragColor[1] = vcolor[1]*(1.0-tox)+gl_FragColor[1]*tox+tex;  "+
			 "  gl_FragColor[2] = vcolor[2]*(1.0-tox)+gl_FragColor[2]*tox+tex;}" +
	" gl_FragColor[0] += hover; gl_FragColor[1] += hover; gl_FragColor[2] += hover;  gl_FragColor[3]=alpha;  } ";



	BABYLON.Effect.ShadersStore.mySurfcolVertexShader = "precision highp float;"+
	"attribute vec3 position;"+
	"attribute vec3 normal;"+
	"attribute vec4 color;"+
	"uniform float alpha;" +		
	"varying vec3 vNormal;"+	
	"varying vec4 ptmp;"+	
	"uniform mat4 worldViewProjection;"+
	"uniform mat4 worldToVoxel;"+
	"uniform vec3 planesPos;" +
	"uniform vec3 uniformcolor;" +
	"uniform float vertexcoloring;" +
	"varying vec4 col;"+
	"void main(void) { "+	
	"   if (vertexcoloring > 0.5) "+
	"     { col[0] = color[0]; col[1] = color[1]; col[2] = color[2]; col[3] = color[3]; } " + 
	"   else "+
    "     { col[0] = uniformcolor[0]; col[1] = uniformcolor[1]; col[2] = uniformcolor[2]; col[3] = alpha; } " + 
//    "     { col[0] = 0.0; col[1] = 1.0; col[2] = 0.0; col[3] = 0.0; } " + 
	"   gl_Position = worldViewProjection * vec4(position,1.0);"+
	"   ptmp = worldToVoxel * vec4(position,1.0) - vec4(planesPos,0.0);"+	
	"   vNormal = normal; " +
	"}";

	BABYLON.Effect.ShadersStore.mySurfcolPixelShader = "precision highp float;"+
	"varying vec4 col;"+
	"varying vec3 vNormal;"+	
	"varying vec4 ptmp;"+	
	"float fac;"+
	"uniform mat4 worldViewProjection;"+
	"uniform float planesThres;" +	
	"uniform float gamma;" +	
	"uniform float alpha;" +	
	"uniform vec3 planesCut;" +
	"void main(void) {"+
	"    if (planesThres != 0.0){ "+
	"    	if((ptmp[0] >planesThres || ptmp[0] < -planesThres)  && "+
	"    	   (ptmp[1] >planesThres || ptmp[1] < -planesThres)  && "+
	"          (ptmp[2] >planesThres || ptmp[2] < -planesThres) )   "+
	"           discard; } " +
	"    else "+
	"       if (    (ptmp[0]*planesCut[0] >= 0.5 || planesCut[0] == 0.0) "+
	"			&&  (ptmp[1]*planesCut[1] >= 0.5 || planesCut[1] == 0.0) "+
	"			 && (ptmp[2]*planesCut[2] >= 0.5 || planesCut[2] == 0.0))"+
    "        	discard; "+
	"    vec3 vNormalW = normalize(vec3(worldViewProjection * vec4(vNormal, 0.0)));" +
	"    if (vNormalW[2] > 0.0 && alpha < 1.0) { discard; } " +	
	"    fac = pow(abs(vNormalW[2]),gamma);"+
	"	 gl_FragColor[0] = fac*col[0];"+
	"	 gl_FragColor[1] = fac*col[1];"+
	"	 gl_FragColor[2] = fac*col[2];"+
	"	 gl_FragColor[3] = col[3];"+
	"}";


	onBabylon();


     });
     });


}