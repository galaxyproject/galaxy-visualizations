///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
/////////////////////// current state
///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////


function StateManager()
{
	var that = new Object();	

	// create a generic state from the preset and other definitions and send back.
	that.makeGenericState = function()
	{
			var genericpreset    =    KForm.getFormContent(presetForm, {} );
			genericpreset.autoloaders = [];
			var generic_project_user    =    KForm.getFormContent(form_project_user, {} );

			generic_project_user.selectedViewerPreset = -1;
			
			state = {
					 id: "0"
					,batchtool: {}
					,toolstate: []
					,tools: {}
					,project: {}
					,project_user: generic_project_user
					,viewer: genericpreset,

				};
				return state;
	}


	that.setDefaultState = function() 
	{
		that.applyState ( that.makeGenericState() );
		//state =   that.makeGenericState();
	}

	
	that.applyState = function(state_new)
	{	
			if(state_new  === undefined)
				return;
			state = state_new;
			ViewerSettings = state.viewer;
			
			setPatientTableWidth();
			setPatientTableLayout();
			$('.leveltab').removeClass('current');		$('#modeSelector_' + state.viewer.selectionMode[1]).addClass('current');
			
			if( typeof KViewer != "undefined" )
			{
				KViewer.applyState(); 
		/* // newtoolstate
				// reestablish the internal state of the tools (buttons ...)
				if(state.tools)
					for(var tool in state.tools)
						if(KViewer[tool] !=undefined)
							KViewer[tool].setState(state.tools[tool]);
			*/				
			}
	}


	that.saveCurrentState = function(whendone,force)
	{	


		if (typeof sharedLink != "undefined" && sharedLink != undefined)
		{
			console.log("state not saved, it's a shared link");
			if(whendone)
				whendone();
			return;

		}

		// do not save for guestuser;
		if(userinfo.username == guestuser && force == undefined) // | projectInfo.rights.readonly == "on" | projectInfo.rights.readonly === false)
		{
			if(whendone)
				whendone();
			return;
		}

		var req = new Array(new Array, new Array);

		// Save all presets,
		var rows = presetManager.getRowsForSaving();
		if(rows.length > 0)
		{
			req[0].push( {command:'jsonTable_insertOrUpdate', json: rows} );
			req[1].push(  function(){} );
		}

		// Save state itself
		if (commandDialog != undefined && commandDialog.getState)
			state.batchtool = commandDialog.getState();

		state.toolstate = KToolWindow.getToolsState();
		
		// put the internal KViewer state (haircros etc) into the state such that it will be saved
		KViewer.saveState()

/* //newtoolstate
		// save the state of individual tools
		if (state.tools == undefined)
			state.tools = {};

		var whichtools = ['roiTool' , 'curveTool' ];

		for (var k = 0 ; k < whichtools.length;k++)
		{
			if( KViewer[whichtools[k]].enabled )
				state.tools[whichtools[k]] =  $.extend(true, {}, KViewer[whichtools[k]].getState() ); 
		}
*/		
 		if( markerProxy != undefined && markerProxy.markersetIDs.length > 0 &&  markerProxy.markersets[markerProxy.markersetIDs[0]] != undefined)
 			state.tools.markerPanel =  $.extend(true, {},  markerProxy.markersets[markerProxy.markersetIDs[0]].state ); 

		if (typeof electron != "undefined" && electron)
		{
    		 dialog.showSaveDialog({ title: 'save settings',
							properties: [],
							defaultPath: "./noraview.settings.json",
						}, function(savename)
						{
						   if (savename == undefined)
						      return;
						     fs.writeFile( savename, JSON.stringify(state) ,undefined,function(err)
						     { 
                                    alertify.success('successfully saved ' + savename);
						     });
						});
     
		}
		else
		{

			var row = {type:'state',  json:state, project:currentModule, MDB_uniquekey: ' type like "state" AND project like "' + currentModule + '" AND owner like "' + userinfo.username + '"' }
				req[0].push( {command:'jsonTable_insertOrUpdate', state:state,json: [row]} );
				req[1].push(  function(result)
				{	
					if(result.json) state.id = result.json[0].id; 
				} ); // update id , important in case this was first insertion

	
			ajaxRequest( req, whendone );
		}



	}
 
	// This function loads the current state from database. Normally done when new project is selected.
// 	that.loadCurrentState = function()
// 	{
// 		jsonTable_load({type:'state'}, whendone);
// 		function whendone(result)
// 		{
// 			that.applyState( result.json[0] ); // take the first row found.
// 		}

// 	}

return that;
}






///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
/////////////////////// Main Settings Forms
///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////


  
   var form_project_user = 
   { 
	name 		: "project_user",
	//classdef  : ".viewersettings .KFormItem {padding:6px;} .viewersettings .KFormItem label {min-width: 170px!important;}",
	items : { "class" : 'KFormItemSettings' },
	layout: 
	[
	 { type: 'title', val: "State settings"}
		,{name:"startupState"  , type: 'option',  style:"radio vert" , title:'What happens on fresh startup/login'
			,choices: ["take most recent state", "choose favourite preset", "use a standard preset, if exists"]
			,ids: ["rememberState", "rememberPreset", "tryUsingStandard"], defaultval:"rememberState"}
		,{name:"updateInterval" 	    , type: 'input',  	 defaultval:60   , title:'Update interval of subject table(in seconds)'}
		,{name:"updateInterval_gridstat", type: 'input',  	 defaultval:30   , title:'Update interval of gridengine statistics (in seconds)'}
		,{name:"localstoragesizeMB"     , type: 'input',  	 defaultval:0    , title:'Size of local hard disk cache, use this if you are remote (in MB)'   }


	]
   }


  var form_autoloader = 
   {
	name 		: "autoloader",
	lastchange  : "",
	type: 'form',
	layout: 
	[
	 	      {name:"enabled"	    	, type: 'check',     defaultval:true, class:"autoloaderitem" }
	 	     ,{name:"viewportID"	    , type: 'input',     defaultval:"0" , class:"autoloaderitem"  }
	         ,{name:"pattern"	    	, type: 'textarea',     defaultval:"FFilename:"  , class:"autoloaderitem"  }
	 	     ,{name:"intent"	    	, type: 'json',     defaultval:""  , class:"autoloaderitem"  }
	]
   }

   var presetForm_autoload = 
   { 
	name 		: "presetForm_autoload",
	lastchange  : "",
	layout: 
	[
		 { type: 'title', val: "Autoloaders"}
	 	,{name:"enableAutoloaders"		, type: 'check',     defaultval:false, css:['display','inline-block']  }
		,{name:"autoloaderLevel"   	    , type: 'option',  style:"",  choices: ["patient or study", "patient", "study"],
											ids: [0, 1,2], defaultval:0}
 	    ,{name:"mainViewport"	   	, type: 'input',     defaultval:-1    }
		,{type: 'separator' }
	   ,{
			name: "autoloaders",
			title: "",
			type: 'formarray',
			createbutton:'Add image loader',
			altcreatebuttons:[{text:"Add annotation loader",fun:addanno}],
			layout: 
			[
				 {name:"pattern"	  , type: 'textarea',  defaultval:"FFilename:"  , class:"autoloaderitem"  }
				 ,{name:"viewportID"  , type: 'input',     defaultval:"0" , class:"autoloaderitem" ,element:"span"}
				 ,{name:"enabled"	  , type: 'check',     defaultval:true, class:"autoloaderitem" ,element:"span"}
				 ,{name:"intent"	  , type: 'json',      defaultval:{}  , class:"autoloaderitem"  , class:"intentfield" ,   onchange: intentchange}

		 	  	 ,{type: 'customelement',  val: variableOptions  , element:"div"   }

			]
	   },
	   {type: 'separator' },
	   {type: 'separator' },

	   { type: 'title', val: "Calculation Panel"},

	   {

			name 		: "calcpanel",
			lastchange  : "",
			type: 'form',
			layout: 
			[
					  {name:"enabled"	    	, type: 'check',     defaultval:false, class:"autoloaderitem" },				
					  {name:"code"	    		, type: 'textarea',  mode:'javascript',  defaultval:"layout = []; \nfunction exec(objs,pinfo) \n{}", class:"autoloaderitem" },
			]
		   }
    ]};


   	function addanno(content)
   	{
        content.intent.autocreate_ano =
			{
				type:"points",
				showPanel:true,
				templates:
				{
					some_name:
					{
						color:"#00FFFF",
						radius:4,
						viewport:0
					}
				}
			}
		content.pattern = "FFilename:youranno.ano.json\nFSubfolder:annotations"
        content.update("intent");

        content.update("pattern");
   	}

	function variableOptions(x)
	{
		var $div = $("<div class='autoloadvaroption' ></div>")

		var $autoroi= $('<span class="Kautocreateroi"><input type="checkbox" name="autocreateroi" ' + (x.intent.autocreateroi != undefined?'checked':'') + 
                      '> <label for="autocreateroi"> autocreate ROI </label></span>')
        $autoroi.on("change",function(e)
        {
        	if ($(e.target).is(':checked'))
        	    x.intent.autocreateroi="0";
        	else
        	    delete x.intent.autocreateroi;
        	x.update("intent")
        })
        
		var $overlay= $('<span class="notroi"><input type="checkbox" name="overlay" ' + (x.intent.overlay==1?'checked':'') + 
                      '> <label for="overlay"> overlay </label></span>')
        $overlay.on("change",function(e)
        {
        	if ($(e.target).is(':checked'))
        	    x.intent.overlay = 1;
        	else
        	    delete x.intent.overlay;
        	x.update("intent")
        })

        var $colmap = $("<select class='notroi' name='colmaps'></select>")
		for (var k = 0; k < colormap.names.length; k++)
		{
			if (x.intent.cmap == k)
				$colmap.append($("<option id='" + k + "' selected > " + colormap.names[k] + "  </option>"));
			else
				$colmap.append($("<option id='" + k + "' > " + colormap.names[k] + " </option>"));
		}
		$div.append($("<label  class='notroi' for='colmaps'>Colormap:</label>"));
        $colmap.on("change",function(e)
        {
        	x.intent.cmap = e.target.selectedIndex
        	x.update("intent")
        })



        var defcol = {color:0};
        if (x.intent.color != undefined)
            defcol = {color:(x.intent.color.length>0?x.intent.color[0]:x.intent.color)}
		var colors = KColor.list;
 	    var $colselector = KColorSelector(colors,function colencode(c) {
                                return "background:" + RGB2HTML(c[0], c[1], c[2]) + ";";
                                },
		 function(c,i) {      
		    x.intent.color=i;
        	x.update("intent")

		}, defcol);
		var $colselector_wrap = $("<span class=optioncolsel> ROI color </span>").append($colselector)


        $div.append($colmap)
        $div.append($overlay)
        $div.append($colselector_wrap)
        $div.append($autoroi.hide())


        intentchange(x.intent,undefined,$div)
		return $div;

	}

   	function intentchange(intent,target,$parent)   	
   	{
		if (target != undefined)
   		    $parent = $(target).parent().parent();
		var $x = $parent.find('.Kautocreateroi,.optioncolsel')
		var $y = $parent.find('.notroi')
   		if (intent.roi)
   		{
   			$x.show();
   			$y.hide();
   		}
   		else
   		{
   			$y.show();
   		    $x.hide();
   		    delete intent.autocreateroi;
   		}

		$x = $parent.find('input[name=overlay]');
	    $x[0].checked = (intent.overlay > 0)

		$x = $parent.find('select[name=colmaps]');
	    $x[0].selectedIndex = intent.cmap;

   	}



   var presetForm_general = 
   { 
	name 		: "viewersettings",
	lastchange  : "",
	
	layout: 
	[
	 { type: 'title', val: "Preset settings"}
	 	,{name:"name"  					, type: 'input',     defaultval:"generic"  }
	 	,{name:"project"				, type: 'input',     defaultval:""  }
	 	//,{name:"rights"					, type: 'input',     defaultval:"rw"  }
		,{name:"rights"   	    , type: 'option',  style:"",  choices: ["private", "readable", "project standard", "project standard, writable" ],
											ids: ["--","r-","s-","sw"], defaultval:"--"}
	 ,{ type: 'separator' }
	]
   }

   var presetForm_viewer_permorder = {name:"permOrder"		        ,  type: 'option',  style:"",  
  	    	choices: ["Human (radiological)", "Human (neurological)","Human (upsidedown)", "Mouse Bruker","Mouse upsidedown","Sheep", 'Memory aligned'],
  	    	ids:     ["human", "human_neuro", "human_flipped", "mouse","mouse_flipped", "sheep","fixed_heart"],
 			title: 'Viewing mode (swaps/flips)', defaultval:"human" }		

   var presetForm_viewer = 
   { 
	name 		: "presetForm_viewer",
	lastchange  : "",
	items : { "class" : 'KFormItemSettings' },
//	classdef  : ".viewersettings .KFormItem {padding:6px;} .viewersettings .KFormItem label {min-width: 170px!important;}",
	layout: 
	[
	 { type: 'title', val: "Viewer"}
		,{name:"defaultFOVwidth_mm" 	, type: 'input',     defaultval:""   ,  title:'Default size of field of view (FOV) in mm, if empty, FOV is automatically computed'  }
	 	, presetForm_viewer_permorder											
		,{name:"globalCoordinates" 	, type: 'check',     defaultval:true ,  title:'Global coordinates'  }
		,{name:"loadBitmapAsNifti" 	, type: 'check',     defaultval:false ,  title:'Load bitmap as nifti'  }
		,{name:"preferqform" 	, type: 'check',     defaultval:false ,  title:'Prefer quaternions during nifti load (qform)'  }
  	    ,{name:"spacedef" , type: 'option',    style:"",  title: 'Apply space definition on image load',
		  choices: ["No",    'right-anterior-superior','left-anterior-superior','right-posterior-superior',
     					'left-posterior-superior','right-anterior-inferior','left-anterior-inferior','right-posterior-inferior','left-posterior-inferior'],
		  ids:     ["NO", 'right-anterior-superior','left-anterior-superior','right-posterior-superior',
 					    'left-posterior-superior','right-anterior-inferior','left-anterior-inferior','right-posterior-inferior','left-posterior-inferior'],
		   defaultval:"NO"} 



		,{name:"maxfilesizeImage"     , type: 'input',  	 defaultval:4000    , title:'Maximum filesize of image data (in MB)'   }

		,{name:"worldVoxelsize" 	, type: 'input',     defaultval:"[1.5,1.5,1.5]" ,  title:'Voxelsize of worldcoordinates (mm)'  }
		,{name:"defaultsizemarker" 	, type: 'input',     defaultval:5 ,  title:'Defaultsize of Marker (mm)'  }
		,{type: 'separator'}
		,{name:"quality3D"			, type: 'input',     defaultval:7  ,  title:'Quality 3D'  }
		,{name:"background3D"			, type: 'input',     defaultval:"#111111"  ,  title:'Background Color in 3D'  }
		,{name:"fiberAlpha"			, type: 'check',     defaultval:false ,  title:'Transparency on Fibers'  }
		,{name:"picto3D"			, type: 'option',  title:'Pose pictogram' ,
										  style:"radio vert",  choices: ["none","Male Body", "Girl", "Minion","Head"],
										   ids: [-1,0,1,2,3],
		    							   defaultval:1}
		,{type: 'separator'}
		,{name:"sizeTablePercent"		, type: 'input',     defaultval:20   ,  title:'Size of table in percent'  }  
		,{name:"nVisibleCols"			, type: 'input',     defaultval:2    ,  title:'Number of columns of visible viewports'  }
		,{name:"nVisibleRows" 			, type: 'input',     defaultval:2    ,  title:'Number of rows of visible viewports'   }
		,{name:"nVisibleBarports" 		, type: 'input',     defaultval:0    ,  title:'Number of rows of bar viewports'   }
		,{name:"barportSizePercent" 	, type: 'input',     defaultval:30    ,  title:'Size of Barports (in percent)'   }
		,{name:"nVisibleVertports" 		, type: 'check',     defaultval:0    ,  title:'Is the big left Viewport visible'   }
		,{name:"vertportSizePercent" 	, type: 'input',     defaultval:60   ,  title:'Size of big left one in Percent'   }

		,{name:"stickytoolbar" 			, type: 'check',     defaultval:true    ,  title:'Toolbar of overlays/ROIs/etc. stay'   }
		,{type: 'separator'}
		,{name:"histoModeDefault"   	, type: 'check',     defaultval:true ,  title:'Visibility of histograms' }
		,{name:"histoSizeFac" 			, type: 'input',     defaultval:1    ,  title:'Relative size of histograms'  }
		,{name:"crosshairModeDefault" 	, type: 'check',     defaultval:true ,  title:'Visibility of crosshair'  }
		,{name:"showInfoBar"   			, type: 'check',     defaultval:true  ,  title:'Visibility of infobar'  }
		
		,{type: 'separator'}
		,{name:"globalCoordinates" 	, type: 'check',     defaultval:true ,  title:'Global coordinates'  }
		,{name:"roiTransparency"   			, type: 'input',     defaultval:.5  ,  title:'Transparency of ROIs'  }
		,{name:"showOutlines"   			, type: 'check',     defaultval:true  ,  title:'Show ROI/Atlas outlines by default'  }
		,{name:"showOutlinesOverlay"   			, type: 'check',     defaultval:false  ,  title:'Show overlay outlines by default'  }
	] };

   var presetForm_ptable = 
   { 
	name 		: "presetForm_ptable",
	lastchange  : "",
//	classdef  : ".viewersettings .KFormItem {padding:6px;} .viewersettings .KFormItem label {min-width: 170px!important;}",
	layout: 
	[
	 { type: 'title', val: "Patient Table"}
		,{name:"numberDisplayedItems"   , type: 'input',     defaultval:100       }
		,{name:"displayOffset"     		, type: 'input',     defaultval:0   ,css:['display','none']    }
		,{name:"selectionMode"   	    , type: 'option',    style:"radio vert",  choices: ["Working/Patient", "Working/Study", "Patient" , "Study"],
										   ids: ["wp","ws","mp","ms"],
		    							   defaultval:"ms"}

		,{name:"sortOrder"   	        , type: 'option',    style:"radio vert",  
		  choices: ["Patientname", "Date"],
		  ids:     ["NAME",        "DATE"],
		   defaultval:"NAME"} 


		,{name:"sortDirection"   	    , type: 'option',    style:"radio vert",  choices: ["Ascending", "Descending" ],
											ids: ["ASC","DESC"],
											defaultval:"ASC"} 

		,{name:"treeAutoExpand"   	    , type: 'option',    style:"radio vert",  choices: ["Expand nothing", "Expand first", "Expand everything" ],
											ids: ["expandNothing","expandFirstStudy","expandEverything"],
											defaultval:"expandFirstStudy"} 
		,{name:"defaultTags"   , type: 'input',     defaultval:"mask,atlas", title: 'Tag suggestions'      }
 	    ,{ type: 'separator' }
		,{name:"physrename" 	, type: 'check',     defaultval:true ,  title:'Physical rename'  }
		,{name:"physdelete" 	, type: 'check',     defaultval:false ,  title:'Physical delete'  }

	]};


	

	var presetForm  = $.extend(true, {}, presetForm_general);

    presetForm.layout = presetForm.layout
			   .concat(presetForm_viewer.layout)
			   .concat(presetForm_ptable.layout)
			   .concat(presetForm_autoload.layout)




///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
//  Settings dialog
///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////


function SettingsDialog()
{
    var that = new Object();

	var dialog = new dialog_generic();
	var $container = dialog.$container;
	dialog.$frame.width(950);
	//dialog.$container.css('overflow', 'hidden');
	that.dialog = dialog;

	var MList = new KList({$menucontainer:dialog.$menu, $targetcontainer:$container, classes:[] });
	dialog.$menu.replaceWith(MList.$ul);

	if (electron)
	{
		MList.append('presets', 'Settings', 	projectSettings);		
	}
	else
	{
		MList.append('projectManagement',  'Project Management', projectManagement);
		MList.append('presets', 'Viewer Settings', 	projectSettings);
	}
	MList.activeID = 'presets';

	/***************************************************************************************
	The project management dialog
	****************************************************************************************/

	function projectManagement()
	{
		projectSettingsDialog($container);
	}

 
	/***************************************************************************************
	The user specific project settings 
	****************************************************************************************/
	function projectSettings()
	{
		return presetManager.renderPresetDialog();
	}


	/***************************************************************************************
	Save state and presets on hide dialog 
	****************************************************************************************/
	dialog.ontoggle = function()
	{ 
		if (!electron)
		{
			if(that.dialog.$frame.css('display')!=='none')
			{
				 //saveAllSettings() ; // is now intrinsically done in saveCurrentState
				 stateManager.saveCurrentState(); 
			}
			else
			{
				// choose the 
				settingsDialog.updateDialog()
			}
		}
	}

	/***************************************************************************************
	Update currrent dialog by re-click simulation
	****************************************************************************************/
	that.updateDialog = function updateDialog()
	{
		MList.updateOrSelectByID(MList.activeID);
	}
    

	/***************************************************************************************
	Choose a tab from outside
	****************************************************************************************/
	that.selectDialog = function selectDialog(activeID)
	{
		if(activeID == 'projectManagement' | activeID == 'presets')
		{
			MList.activeID = activeID;
			MList.updateOrSelectByID(MList.activeID);
		}
	}


    signalhandler.attach("projectchanged",function()
    {
    	setTimeout(function() {
  	 	  	  that.updateDialog();
    	},0);
   	});	

	that.dialog = dialog;
	that.updateDialog();
	//dialog.$frame.show();

	return that;
}









///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
//  Preset Manager
///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////



function PresetManager()
{
	/***************************************************************************************
	Basic Vars
	****************************************************************************************/

	var that = new Object();


	// state and presets can have slightly different forms
	var forms_preset = {	general: [presetForm_general, "content"], 
							ptable: [presetForm_ptable, "content"], 
							viewer: [presetForm_viewer, "content"],
							autoloader: [presetForm_autoload, "content"] };

	var forms_state = {		general: [form_project_user, "project_user"], 
							ptable: [presetForm_ptable, "content"], 
							viewer: [presetForm_viewer, "content"],
							autoloader: [presetForm_autoload, "content"] };

	// create the generic preset
	var genericpreset = {content: KForm.getFormContent(presetForm, {} ), id:"0", forms: forms_preset};
	var genericautoloader  =  KForm.getFormContent(form_autoloader, {}) 
	that.genericpreset = genericpreset;

	var presetList = new Object();
	var activePreset = undefined;

	that.setPresetList = function(list)		{presetList = list	}
	that.getPresetList = function()		{return presetList;  	}
    that.getActivePreset = function()   {return activePreset;    }


	/***************************************************************************************
	Button Callbacks
	****************************************************************************************/
	var $favstar = $("<i class='fa fa-star' style='color: hsl(50, 100%, 50%);'></li>");
	function setStartupPreset(sid)
	{
		if(sid =="0")
			return
		state.project_user.selectedViewerPreset = sid  ;
		if(that.PList[state.project_user.selectedViewerPreset] !== undefined)
			$favstar.appendTo( that.PList[state.project_user.selectedViewerPreset]);
	}


	that.takeautosnapshot = function(presetID, notsmart)
	{ 
		if(presetID !== "0" && !activePreset.iswritable)
			{throwReadonlyError(); return}
		viewportContentToAutoloaders(presetID, notsmart);
		that.PList[activePreset.id].trigger("click");
	}



	that.pasteit  = function(toinsert)
	{
    		try
 	  		{	  		
				var obj = JSON.parse(toinsert);
	  		}
	  		catch (err)
	  		{
				return false;

	  		}
	  		if (obj.nVisibleBarports != undefined)
	  		{
				activePreset.content = obj;
				that.applyPreset();
				presetManager.PList[activePreset.id].trigger("click");
				//that.selectPreset(activePreset );				
				return true;
	  		}

	}







	/***************************************************************************************
	Render the preset dialog (left list + right content)
	****************************************************************************************/
	that.TList = undefined;
	that.PList = undefined;
	that.renderPresetDialog = function()
	{
		// the Preset Container
		var $presetContainer = $("<div class='KListView'></div>");
		var $listDIV = $("<div></div>").appendTo($presetContainer);
		var $rightDIV = $("<div class='KFlexVertical'></div>").appendTo($presetContainer);



		if (electron)
		{
			$("<span style='width:80px;' class='modernbutton'> save </span>").appendTo($rightDIV).click(
					function() { stateManager.saveCurrentState(function() { altertify.success("saved")},true); } );
			$("<span style='width:80px;' class='modernbutton'> defaults </span>").appendTo($rightDIV);

		}

		/////// Preset Tools
		var $tDIV = $("<div style='background:hsl(0, 0%,16%);'></div>").appendTo($rightDIV);

		if (electron)
			$tDIV.hide();

		var $tools = $("<div class='modernbuttongroup'></div>").appendTo($tDIV);
		var $apply = $("<div class='modernbutton small green'><i class='fa fa-arrow-left'></i>Apply preset as state</div>").appendTo($tools).click( function() {that.applyPreset(that.PList.activeID)  } );
		var $asStandard = $("<div class='modernbutton small yellow'><i class='fa fa-star'></i>set preset as startup default</div>").appendTo($tools).click( function(){ setStartupPreset(activePreset.id) }   );
		var $delete = $("<div class='modernbutton small red'><i class='fa fa-trash'></i>delete preset</div>").appendTo($tools).click( deletePreset  );


		//var $cDIV = $("<div  class='KListView_vertical'></div>").appendTo($rightDIV);

		var $cDIVupper = $("<div style='background:hsl(0, 0%,16%);' class=''></div>").appendTo($rightDIV);
		var $cDIVLower = $("<div class='' ></div>").appendTo($rightDIV);



		/////// preset List
		var PList = new KList({ $targetcontainer:$cDIVLower, classes:["vertical", "classic" ,"inverted"] });
		if (!electron)
			PList.$ul.appendTo( $listDIV );
		else
			$listDIV.hide();


		/////// viewer List and so on
		var TList = new KList({ $targetcontainer:$cDIVLower,  classes:["horizontal", "roundish"]   });
		TList.$ul.appendTo( $cDIVupper );

		if (!electron)
		{
			TList.append('general',  	'general', renderPresetSubForm  );
			TList.append('autoloader',  'autoloaders', renderPresetSubForm  );
		}
				
		TList.append('viewer', 		'viewer', 	 renderPresetSubForm);
		
		if (!electron)
			TList.append('ptable', 		'table', 	renderPresetSubForm);
		
		TList.append('jsoncode', 		'jsoncode', 	renderJSONCode);

		// this is to remember which tab was clicked need referencing
		PList.subList = TList;

		
		function renderPresetList()
		{
			activePreset = undefined;
			PList.$ul.empty();
			
			//first element in list is state
 			PList.append("0",  'current state', undefined, function() 
 			{
 					statePreset = 
 					{
 						id: "0",
 						content: state.viewer,
 						project_user: state.project_user,
 						forms: forms_state,
 						iswritable:true
 					};
 					selectPreset( statePreset );
 			} );

			// new preset button
  			$("<div class='modernbutton small green' ><i class='fa fa-arrow-down'></i>Copy state as new preset</div>")
  			           .click( function(){copyElement()}).appendTo(PList.$ul);




			$("<div class='modernbutton small red' ><i class='fa fa-copy'></i>Copy state to clipboard</div>")
  			           .click( function(){
							var content= $.extend(true, {}, state.viewer);
							content.toolstate = state.toolstate;

							  var $temp = $("<textarea style='position:absolute; display:block;z-index:99999;top:0px'>"+JSON.stringify(content)+"</textarea>").appendTo($body).select();
							  var successful = document.execCommand('Copy');
							  $.notify(" Copied to clipboard","success");
							  $temp.remove();


  			           }).appendTo(PList.$ul);

			$("<div class='modernbutton small red' ><i class='fa fa-copy'></i>Paste state from text</div>")
  			           .click( function(){
						


										alertify.prompt('Please insert JSON String from your clipboard and press enter', function(a,b)
										{
											if(a)
											{
											 if (!that.pasteit(b))
												alertify.alert("Nora not able to understand your clipboard contents");

											}
										});



  			           }).appendTo(PList.$ul);




			PList.append("spacer", 'presets');
			for(var id in presetList)
			{
				if(id!="0"){
					var p = presetList[id];
					PList.append(p.id,  p.content.name, undefined, function(id){return function() {selectPreset(id)} }(id) );
				}
			}

			if(that.PList && that.PList.activeID != undefined && PList[that.PList.activeID])
				PList[that.PList.activeID].trigger('click');
			else
				PList.updateOrSelectByID(); // select first element

			if(that.TList && that.TList.activeID != undefined)
				TList[that.TList.activeID].trigger('click');
			else
			{
				if (electron)
					TList.updateOrSelectByID('viewer'); // select autoloader tab
				else
					TList.updateOrSelectByID('autoloader'); // select autoloader tab
			}
				

			that.PList = PList;
			that.TList = TList;

			// set the star of standard standard
			setStartupPreset(state.project_user.selectedViewerPreset);

		}

		function selectPreset(arg)
		{
			if(typeof arg =="object")
				activePreset = arg;
			else
				activePreset = presetList[arg];

			if(activePreset.id == "0")
				{$tools.css('visibility', 'hidden') }	
			else
				{$tools.css('visibility', 'visible') }
		}
		that.selectPreset = selectPreset;


		function renderJSONCode()
		{
			
			var jsoneditor = new KJSONEditor(activePreset, 'content',  { parseonblur:1, editable:activePreset.iswritable, copybutton:1 });
			var $formDIV = $("<div style='position:relative;width:100%;height:95%'></div>")
				.append(jsoneditor.$container);
			return $formDIV
		}


		function renderPresetSubForm(id)
		{
			var $formDIV = $("<div style='position:relative;width:100%;'></div>");
			
			// form onchange
			function onchange(obj, field, val)
			{
				if(field === 'name') // set the title of this preset in left list
				{
					var newname = activePreset.content.name;
					PList[activePreset.id].html(newname);

					//if(KViewer != undefined)
					//	KViewer.autoloader_updateList();
				}
				if (field == 'picto3D')
				{
					signalhandler.send('picto3dmodel_changed');
				}

			}

			//forms are in forms[0],  target variable can depend on form, is in forms[1] (see createPresetList)
			//KForm.createForm(activePreset.forms[id][0], activePreset[activePreset.forms[id][1]], $formDIV, onchange);
			if(id =='general' && activePreset.id == "0")
				KForm.createForm(forms_state[id][0], activePreset[forms_state[id][1]], $formDIV, onchange);
			else
				KForm.createForm(forms_preset[id][0], activePreset[forms_preset[id][1]], $formDIV, onchange);
			
			
			
			if(id=='autoloader') 
			{
				var $snapshot = $("<div class='modernbutton small' style='position:absolute;right:0px;top:0px;width:210px'><i class='fa fa-camera'></i>take snapshot</div>")
					.appendTo($formDIV).click( that.takeautosnapshot   );
			}


			if(!activePreset.iswritable)
			{
				$formDIV.find("input").attr("disabled", true); 
				$formDIV.find("textarea").attr("disabled", true); 
				$formDIV.find("select").attr("disabled", true); 
				// form array clickers
				$formDIV.find(".KFormItem_formarray_tool").off('click').click( function(ev){ return throwReadonlyError()}  ) ;
			}

			return $formDIV;
		}

		

		/***************************************************************************************
		Delete Preset
		****************************************************************************************/
		function deletePreset(listid)
		{
			var id = activePreset.id;
			if(id == "0")
				return;

			if(!activePreset.iswritable)
			{
				$.notify("You do not have the rights to delete this preset!","error");	
				return;
			}
			jsonTable_delete( {id:id}, whendone);

			function whendone(result) 
			{
				if(result.msg=='')
				{
					PList[id].remove();
					delete presetList[id];
					if(id == activePreset.id )
					{
						nextID = Object.keys(presetList)[Object.keys(presetList).length-1] || "0";
						PList[nextID].trigger('click');
					}
				}
				else
				{
					alert("Could not delete Element in SQL");
				}
			}
	   }

		/***************************************************************************************
		Extend current state to Preset
		****************************************************************************************/
		that.overwritePresetWithState = function(id)
		{
			if(presetList[id] == undefined)
				return false;
			if(!presetList[id].iswritable)				
				alert("Preset is not writable");
				
			// must keep the name and the id ... so do not do a deep extend! (autloader list will be cleared)	
			var oldname = presetList[id].content.name;
			var oldrights = presetList[id].content.rights;
			var oldiswritable = presetList[id].iswritable;
			
			presetList[id].content = $.extend(false, {}, state.viewer);
			
			// make sure project is correct
			presetList[id].content.project = currentModule;
			
			// keep name and rights of old preset
			presetList[id].content.name = oldname;
			presetList[id].content.rights = oldrights;


			presetList[id].iswritable = oldiswritable;
			
// 			saveSinglePreset(presetList[id]);
// 			return true
			return presetList[id]
			
		}

		/***************************************************************************************
		Copy Preset
		****************************************************************************************/
		function copyElement(preset)
		{
			var basename = "preset";
			var newname = basename;

			for(var k=0;k<50;k++)
			{
				newname = basename+ "(" + k + ")";
				var found = false;
				for(var id in presetList)
				{
					if( presetList[id].content.name == newname)
						found = true;
				}
				if (!found)   	  
					break; 
			}

			var newPreset = new Object();
			newPreset.id=  'temp' + (Object.getOwnPropertyNames(presetList).length+1);
			newPreset.content= $.extend(true, {}, state.viewer);
			newPreset.content.name  = newname;
			newPreset.content.owner = userinfo.username;
			newPreset.content.rights = '--';
			newPreset.content.project = currentModule;
			newPreset.content.toolstate = state.toolstate;

			//newPreset.forms= genericpreset.forms,
			newPreset.iswritable = true;

			//save already here to database ...
	        saveSinglePreset(newPreset ,  whendone);
			function whendone(result) 
			{
			  newPreset.id = result.json[0].id;
			  newPreset.content.id = newPreset.id;

			  presetList[newPreset.id] = newPreset;
 			  renderPresetList();
 			  PList[newPreset.id].trigger("click");
			}

	   }
	   that.copyElement = copyElement;

	   renderPresetList();
	   // this would not work with the standalone version
	   //that.loadPresets(renderPresetList);
	   

	   return $presetContainer;		
	}
	/***************************************************************************************
	END OF renderPresetDialog
	****************************************************************************************/
   



	function throwReadonlyError()
	{
		alertify.alert('These presets are readonly. Please make a copy if you want to change them.');
		return false;
	}

	/***************************************************************************************
	Load preset list from server
	****************************************************************************************/
    that.loadPresets = function(callback)
    {
 		jsonTable_load( {type:'viewersettings'}, function(result)
 		{
 			that.createpresetListFromAjax(result.json);
 			if(callback)
 				callback();
 		}) ;
 	
    }


	/***************************************************************************************
	Create the list from ajax return
	****************************************************************************************/
	that.createpresetListFromAjax = function(ajaxList_in)
	{
		presetList = new Object();

		if(ajaxList_in == null)
			return false;
		
		var ajaxList = [];
		if(!$.isArray(ajaxList_in))
		{
			for(var k in ajaxList_in)
				ajaxList.push(ajaxList_in[k].content);
		}
		else
		{
			ajaxList = ajaxList_in;
		}


		for(var k=0; k < ajaxList.length; k++)
		{
			//$.extend(true, ajaxList[k], genericpreset);
			// generic as basis
			var base = $.extend(true, {}, genericpreset.content);
			presetList[ajaxList[k].id] = 
			{
				id:ajaxList[k].id, 
				content:  $.extend(true, base,  ajaxList[k] ),
				forms: forms_preset 
			};

			// check if writable
			var preset = presetList[ajaxList[k].id];
			preset.iswritable = ( (preset.content.rights.substr(1,1) == 'w') | preset.content.owner == userinfo.username ) ;
			//preset.iswritable  = false;

		}
	}




	/***************************************************************************************
	preset selection / application 
	****************************************************************************************/
 	that.applyPreset = function(id)
	{

		if(id !== undefined)
			var preset = presetList[id];
		else
			var preset = activePreset;

   	/* ????????? ask Elias 
		if( activePreset  == undefined){ alertify.alert("No valid preset selected. Aborting"); return }
   		state.viewer = $.extend(true, {}, activePreset.content);
	*/

		if( preset  == undefined){ alertify.alert("No valid pjsonTable_savereset selected. Aborting"); return }

		var toolstate;
		if (preset.content.toolstate)
		{
			toolstate = preset.content.toolstate;
			console.log("toolstate loaded by applyPreset")
		}
	
   		state.viewer = $.extend(true, {}, preset.content);
		state.viewer.toolstate = undefined;
		

   		ViewerSettings = state.viewer;

		// new: do not apply selection mode or table width.
		// no harm to project change: there, it is still done with another function
		switchto(state.viewer.selectionMode);  	
	 	
		if( typeof KViewer !== "undefined" ) 
			KViewer.applyState(); 

		if (toolstate)
			KToolWindow.reestablishToolState(toolstate);
		
   	}

 	that.applyPresetByName = function(name)
	{
		for (var k in presetList)
		{
			if (presetList[k].content.name == name)
			{			
				that.applyPreset(k);
				return;
			}
		}
		alertify.error("Preset " + name + " not found, keeping old preset."); 

	}



	/***************************************************************************************
	preset selection / application: Viewer / autoloader settings only
	****************************************************************************************/
 	that.applyPresetViewerOnly = function(id)
	{
   	 
		if(id !== undefined)
			var preset = presetList[id];
		else
			var preset = activePreset;

		state.viewer.nVisibleVertports =  preset.content.nVisibleVertports;
		state.viewer.nVisibleCols =  preset.content.nVisibleCols;
		state.viewer.nVisibleRows =  preset.content.nVisibleRows;
		state.viewer.nVisibleBarports =  preset.content.nVisibleBarports;
		state.viewer.autoloaders = $.extend(true, [], preset.content.autoloaders );
		state.viewer.autoloaderLevel = preset.content.autoloaderLevel;
	
		if( typeof KViewer !== "undefined" ) 
			KViewer.applyNewViewportLayout();

   	}



   

	/***************************************************************************************
	Save stuff
	****************************************************************************************/
	function saveSinglePreset(preset,  whendone)
	{
		var row = { type:'viewersettings', id: preset.id, json:preset.content}; 
		jsonTable_save(row, whendone)
	}

	that.saveAllPresets = function savePresets()
	{
		var rows = that.getRowsForSaving();
			if(rows.length > 0)	
				jsonTable_save(rows)
	}
  
	that.getRowsForSaving = function()
	{
  		var rows = new Array();
	   	for(var id in presetList)
   		{
   			var preset = presetList[id];
   			if (id !== "0" & preset.iswritable) // do not save the state nor non-writable settings!
			{
				rows.push( { type:'viewersettings', id: id, json:preset.content }  ); 			

// to be properly implemented: only ask if really changed!!!
// 				if(preset.content.rights[0] == "s")
// 					alertify.confirm("You changed the public standard settings of <b>"+ preset.content.name + "</b> <br>This might affect other users! Press OK to save the changes.", function(ans)
// 					{ 	
// 						if(ans)		
// 							rows.push( { type:'viewersettings', id: id, json:preset.content }  ); 			
// 					});
			}

   		}
 		
  		return rows;
	}

   


	/***************************************************************************************
	viewportContentToAutoloaders
	****************************************************************************************/
	function viewportContentToAutoloaders(presetID, notsmart)
	{ 
		if(presetID == "0")
			//var autoloaders = statePreset.content.autoloaders;
			var autoloaders = state.viewer.autoloaders;
		else
			var autoloaders = activePreset.content.autoloaders;
			

		// clear the loaders first
		//autoloaders.length = 0;
		var oldloaders =  autoloaders.splice(0, autoloaders.length);
		var idlist = {};
		for(var k=0; k<oldloaders.length; k++)
			idlist[oldloaders[k].id] = k;
			
		var s = gatherState();
		var items = s.viewports;
		if(s.viewports.length == 0 )
		{
			alertify.error('There are no images in any of your viewports!');
			return false;
		}
		else
		{
			alertify.success('Snapshot taken.');
			function extendtoArray(dest,src,field)
			{
				if( src[field] == undefined) // do not set undefined values !!!
					return

				if (Array.isArray(dest[field]))
					dest[field].push(src[field]);
				else
					dest[field] = [dest[field] , src[field]];

			}

			var params = {};
			for (var k = 0; k < items.length;k++)
			{
				if (items[k].intent.gl)
					items[k].intent.slicing = 'gl';

				if (params[items[k].id] != undefined)
				{

					extendtoArray(params[items[k].id].intent,items[k].intent,'color');
					extendtoArray(params[items[k].id].intent,items[k].intent,'select');
					extendtoArray(params[items[k].id].intent,items[k].intent,'slicing');
					extendtoArray(params[items[k].id].intent,items[k].intent,'cmap');
					extendtoArray(params[items[k].id].intent,items[k].intent,'viewportID');					
				}
				else
				{
					params[items[k].id] = items[k];
				}
			}

			for (var k in params)
			{
				if (params[k])
				{
					// do not consider temporary ROIs
					//if( params[k].fileID.substr(0,3) == "ROI")
					//	continue;
						
					// check if a loader with this specific id is already here ...
					var loader = $.extend(true, {}, genericautoloader); // create a new empty autoloader;

					var id =  params[k].id;
					if(idlist[id] != undefined)
					{
						if(oldloaders[idlist[id]].pattern !=undefined && oldloaders[idlist[id]].pattern.trim() !="")
							loader.pattern = oldloaders[idlist[id]].pattern;
						else
							loader.pattern = guessFilePattern(notsmart);
					}
					else
					{
						loader.pattern = guessFilePattern(notsmart);
					}

					function guessFilePattern(notsmart)
					{
						var fobj = KViewer.dataManager.getFile(params[k].fileID);
						var finfo = fobj.fileinfo;
						var pattern;

						var filename = finfo.Filename;
						if(filename == undefined)
							filename = fobj.filename +".nii.gz";

						if(filename == undefined)
							return "";

						var extpos = filename.search("\\.");
						var fname = filename.substring(0,extpos);
						var ext = filename.substring(extpos);

						if (finfo.SubFolder == "forms" |  (finfo.Tag != undefined && finfo.Tag.search("/FORM/") > -1))
						{
							pattern =  "FFilename:"  + filename.split(".")[0] + ".form.json";
							params[k].intent.defaultform = true;
						}
						else if(notsmart)
						{
							pattern =  "FFilename:"  + filename;
						}
						else
						{
							// only add a wildcard for _sXXX files.
							if( fname.match(/s\d\d\d/) )
							{
								while ($.isNumeric(fname[fname.length-1]))
									fname = fname.substring(0,fname.length-1);
 								fname = fname + '*' + ext;
								pattern = "FFilename:" + fname;
							}
							else
							{
								pattern =  "FFilename:"  + filename;
							}
						}
						if (finfo.patients_id == 'ANALYSIS')
							pattern = "PPIZ:ANALYSIS\nSStudyID:" + finfo.studies_id + "\n" + pattern;

						var subf = finfo.SubFolder;
						if (subf != "" & subf != undefined)
							pattern += "\nFSubFolder:" + subf.substring(0,5) + "*";
						
						return pattern;
					}




					loader.id = id;
					autoloaders.push(loader);

					if(params[k].intent.viewportID !== undefined )
					{	
						loader.viewportID = params[k].intent.viewportID; 
						delete params[k].intent.viewportID;
					}

					var intent_keys = Object.keys(params[k].intent);
					for (var j=0;j < intent_keys.length;j++)
					{
						if (params[k].intent[intent_keys[j]] == undefined)
							delete params[k].intent[intent_keys[j]];
					}


					if( params[k].fileID.substr(0,3) == "ROI")
					{
						params[k].intent.autocreateroi = "0";
					}

					delete params[k].intent.gl;

					loader.intent = params[k].intent;

				}	   		
			}
		}
	}


	return that;
}





