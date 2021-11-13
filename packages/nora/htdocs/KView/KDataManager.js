
// ======================================================================================
// ======================================================================================
// ============= KDataManager
// ======================================================================================
// ======================================================================================

function KDataManager()
{
  /** The datamanager   
   * @class 
   *  @alias KDataManager */
  var that = new Object();

  /** The files/data list (Object key is sqlid/filepath)
   * @private */
  var files = {};

  var runningID = 0;

  /** Initiates data request to server/localfilesystem 
   @param {object} params - parameters of file loading task
   @param {string} params.fileID - sqlid/filepath of file to be loaded    
   @param {string} params.URLType - from where (serverfile/localfile)
   @param {callback} params.callback - once file has arrived and processed callback(fileObject) is called
   @param {callback} params.progressSpinner - neccessary to show progress
   @function */
  that.loadData = function (params)
  {
    if(params.URLType === 'localfile' )
    {
    	var f = KViewer.dataManager.getFile(params.fileID);
		if (f == undefined)
      		loadDataFromLocalFile(params)
      	else if (params.callback)
      		params.callback(f);
    }
    else if(params.URLType === 'foreignurl' )
    {
      loadDataFromURL(params);
    }
    else if(params.URLType === 'dicomweb' )
    {
      loadDataFromDICOMWEB_URL(params);
    }
    else if (params.URLType === 'form')
	{
		if (params.callback)
    	{
    		params.callback( {contentType: 'json', fileinfo:{Tag:'/FORM/'}, 
    		              content: {name:params.fileID,content:params.content} });

			return;
    	}
	}	
    else if (params.URLType === 'createROI')
	{
		if (params.callback)
    	{
    		if (KViewer.dataManager.getFile(params.fileID) == undefined)
    		{
				alertify.error("template file for roi creation not present: " + params.fileID);
				params.callback();
				return;
    		}

    		if (params.intent && params.intent.shared && params.intent.shared.already_present)
    			params.callback(params.intent.shared.already_present);
			else
				KViewer.roiTool.pushROI(params.fileID, params.intendedName, undefined, function (ev){
					if (params.intent && params.intent.shared)
						params.intent.shared.already_present = ev;
					params.callback(ev);
					});
			return;
    	}
	}
   else if (params.URLType === 'createANO')
	{
		if (params.callback)
    	{
			var mset = markerProxy.newSet(params.fileID);  
			params.fileID= "MSET"+(runningID++);
    		params.callback(mset);
	//	    KViewer.roiTool.pushROI(params.fileID, params.intendedName, undefined, params.callback);
			return;
    	}
	}
    else  if(params.URLType === 'cachefile')
    {
	    var reader = new FileReader();
		reader.onload = function(e) {
			 processLoadedFile(params,reader) };
		reader.readAsArrayBuffer(params.file);
	}
    else
    {
      loadDataFromServer(params);
    }
  }

  /**
   * @function */
  that.loadProxy = function (params,update)
  {
     var fobj = {proxyev:params,fileID:'proxy'+params.fileID.substring(5),fileinfo:{},filename:params.filename.substring(12)};
	 if (params.SubFolder)
	 	fobj.fileinfo.SubFolder = params.SubFolder;

     setFile(fobj.fileID,fobj);
     if (update == undefined || update == true)
     	KViewer.cacheManager.update();
  }


  /**
   * @function */
  function setFile(fid,fobj)
  {
  	 files[fid] = fobj;
  }
  that.setFile = setFile;

  /**
   * @function */
  function getFile(fid,params)
  {
  	 if (fid.substring(0,5) == 'proxy' & params != undefined & files[fid.replace("proxy","local")] == undefined)
  	 {
		 var proxy = files[fid];
		 var reader = new FileReader();
		 proxy.proxyev.progressSpinner = params.progressSpinner;
		 proxy.proxyev.callback = params.callback;
		 reader.onload = function(e) { processLoadedFile(proxy.proxyev,reader);  };

		 delFile(fid);

		 readBufferFromFile(reader,proxy.proxyev);
		 //reader.readAsArrayBuffer(proxy.proxyev.file);
		 return "proxy";
  	 }
  	 else
  	 {
  	 	var fobj;
  	 	if (files[fid.replace("proxy","local")] != undefined)
  	 		fobj = files[fid.replace("proxy","local")];
  	 	else
	  	 	fobj = files[fid];

		if (fobj != undefined)
			fobj.editable = fid.substring(0,9) == "localfile" | fid.substring(0,3) == "FVS" | fid.substring(0,3) == "ROI" | fobj.modified;

		return fobj;

  	 }
  }
  that.getFile = getFile;

  /**
   * @function */
  that.getFileIdByNiiFile = function getFileIdByNiiFile(nii)
  {  	
  	for(var id in files)
  	{
  		if(files[id].content == nii)
  			return id;
  	}
	return false;
  }


   that.refetchAllFiles = function()
   {
		var keys = Object.keys(files);
		var pbar = KProgressBar("updateing","fa-submit",undefined);

		iterate(false);
		var cnt = 0;
		function iterate(updated)
		{
			if (updated)
				cnt++;
			if (keys.length == 0)
			{
				pbar.done();
				/*
					if (cnt == 0)
						alertify.error("No files require for update");
					else
						alertify.success(cnt + " files updated");				
						*/
				return;
			}
			var fobj = files[keys[0]];
			keys.splice(0,1);
			if (fobj.fileinfo.ID != undefined)
			{
				if (fobj.subfolder != undefined)
				    var txt = fobj.subfolder+"/"+fobj.filename
				else
				    var txt = fobj.filename		

				pbar.progress(0,"checking for " + txt)				    	    
				that.refetchFile(fobj.fileinfo,function (p) { 
				    if (p != undefined)
				        pbar.progress(p*100,"updateing " + txt)
				     } ,iterate);
			}
			else
				iterate(false);
					
		}

   }

	that.refetchFile = function(fileinfo,progress,callback)
	{
		ajaxRequest('command=get_fileidentifier&json=' + JSON.stringify({fileID:fileinfo.ID}) ,
				function(e){
					if (e.identifier != fileinfo.identifier || e.identifier == "")
					{
						progress();
						KViewer.dataManager.delFile(fileinfo.ID,true);
						KViewer.dataManager.loadData({fileID:fileinfo.ID,
						progressSpinner: progress,
						callback: function ()
						{
							 console.log("file " + fileinfo.ID + " was reloaded");
							 signalhandler.send("updateFilelink",{id:fileinfo.ID});
							 progress();
							 callback(true);
						}});

					}
					else
					{
					    console.log("file " + fileinfo.ID + " is up to date");						
						progress();						
						callback(false);
					}
				});

	}


  /**
   * @function */  
  function delFile(fid,donotRemoveFromViewer)
  {
  	 if (!donotRemoveFromViewer)
  	 {
		 KViewer.iterateMedViewers(function(medV) {
			   for (var j = 0; j < medV.ROIs.length;j++)
			   {
					if (medV.ROIs[j].roi.fileID == fid)
					{
						medV.ROIs[j].close();
						break;
					}
			   }
			   for (var j = 0; j < medV.overlays.length;j++)
			   {
					if (medV.overlays[j].currentFileID == fid)
					{
						medV.overlays[j].close();
						break;
					}
			   }
			   for (var j = 0; j < medV.objects3D.length;j++)
			   {
			   		if ( medV.objects3D[j].fibers && medV.objects3D[j].fibers.fileID == fid)			   		
			   		{
 						medV.objects3D[j].close();
 						break; 
			   		}
			   }

			   if (medV.currentFileID == fid)	
					medV.close();
		 });
		 if (KViewer.obj3dTool && KViewer.obj3dTool.isinstance && KViewer.obj3dTool.objs)
		 {
			 delete KViewer.obj3dTool.objs[fid]
			 KViewer.obj3dTool.update();
		 }
		 if (KViewer.atlasTool && KViewer.atlasTool.isinstance && KViewer.atlasTool.objs)
		 {
			 delete KViewer.atlasTool.objs[fid]
			 KViewer.atlasTool.update();
		 }
		 if (KViewer.roiTool.isinstance && KViewer.roiTool.ROIs)
		 {
			 delete KViewer.roiTool.ROIs[fid];
			 KViewer.roiTool.update();
		 }






  	 }

	if (files[fid] && files[fid].content && files[fid].content.octreeWorker)
		files[fid].content.octreeWorker.kill();


    if (files[fid] && files[fid].worker != undefined)
	{
		files[fid].worker.postMessage({msg:'kill'})
		files[fid].worker = undefined;
	}

    if (files[fid] && files[fid].refvisit_tck != undefined)
	{
		if (files[fid].refvisit_tck.visitworker)
		{
			files[fid].refvisit_tck.visitworker.kill();
			files[fid].refvisit_tck.visitworker = undefined;
		}
	}


  	 delete files[fid];
  }
  that.delFile = delFile;


  /**
   * @function */
  function getFileList()
  {
  	// return keys of file list,  ordered by file name!
  	var keys = Object.keys(files);
  	var arr = [];
  	for(var k=0;k<keys.length; k++)
  	{
		arr.push( [ keys[k].split("file_")[1], keys[k] ] );
  	}
  	arr.sort(function(a,b) {      return a[0] > b[0];    });
  	var kk = arr.map(function(x){ return x[1] });
  	return kk;//Object.keys(files);
  }
  that.getFileList = getFileList;

  function getNextIteratedFilename(basename, baselist)
  {
	var found = undefined;
	baselist = baselist|| files;
  	for(var f in baselist)
  	{
		if(baselist[f].filename.substring(0,basename.length) == basename)
			found = f;
  	}
  	if(found!=undefined)
  	{
  		var m = baselist[found].filename.match(/\d+$/);
  		if(m!=null)
  			basename = basename.substring(0,m.index) +  (parseInt(m)+1).toFixed(0);
  		else
  			basename = basename + "0";
  	}
	else
		basename = basename + "0";

	return basename;
  }
  that.getNextIteratedFilename = getNextIteratedFilename;


	that.coregInfos = {};
	/**
	* @function */
	function setCoregInfo(psid, coreginfo, del)
	{
		if(del == undefined)
			that.coregInfos[psid] = coreginfo;
		else
			delete that.coregInfos[psid]
	}

	that.setCoregInfo = setCoregInfo;


  

  function loadDataFromLocalFile(params)
  {
    var reader = new FileReader();
    reader.onload = function(e) { processLoadedFile(params,reader) };
    reader.onprogress = function(pev) {
			if (params.progressSpinner != undefined && pev.total > 0)
			 params.progressSpinner(pev.loaded/pev.total,function() {

			 	if (typeof xhr != "undefined")
			 		xhr.abort() 
			 	else
			 		reader.abort();

			 	} ); };
    reader.onerror = function(e) { 
	
    alertify.error("problem loading file:" + params.filename); 
    if (params.callback) params.callback(undefined); };
	readBufferFromFile(reader,params);

  }

  function loadDataFromURL(params)
  {

		var fobj = KViewer.dataManager.getFile(params.fileID)
		if (fobj != undefined)
		{		 				 	
			if (params.callback)
			{
				params.callback(fobj);
				return;
			}
		}

		if (params.url == undefined && params.fileID != undefined)
			params.url = params.fileID;

		var xhr = new XMLHttpRequest();
		
		var suffix = "";
		var suffix = "?v=" + Date.now();
		
		xhr.open('GET', `${window.location.protocol}//${params.url}${suffix}` , true);
		
		xhr.setRequestHeader('Cache-Control', 'no-cache');
		xhr.responseType = 'arraybuffer';
		xhr.onerror = function(e) { alertify.error("url  " +params.url+  " not loaded for unknown reasons"); if (params.callback) params.callback(undefined); };
		xhr.onprogress = function(pev) {
			if (params.progressSpinner != undefined && pev.total > 0)
			 params.progressSpinner(pev.loaded/pev.total,function() {xhr.abort() } ); };
		xhr.onload = function(e) {
		  if (this.status == 200) {
			processLoadedFile(params,xhr) 
			// myBlob is now the blob that the object URL pointed to.
		  }
		  else if (this.status == 404) {
			 alertify.error("url " +params.url+  " not loaded (404)"); if (params.callback) params.callback(undefined);
		  }

		};
		xhr.send();
  }

  function loadDataFromDICOMWEB_URL(params)
  {


	    var x = params.fileID.split("/studies/");
	    var url = x[0];
	    x = x[1].split("/series/");
	    var serUID = x[1];
	    var stuUID = x[0];


        // thi is not yet working (ID are not mapped)
		var fobj = KViewer.dataManager.getFile(params.fileID)
		if (fobj != undefined)
		{		 				 	
			if (params.callback)
			{
				params.callback(fobj);
				return;
			}
		}


        const client = new DICOMwebClient.api.DICOMwebClient({url});
		client.retrieveSeries({
	        seriesInstanceUID:serUID,
	        studyInstanceUID:stuUID,
			progressCallback: function(w)
			{
			  KViewer.cacheManager.progressSpinner("dicomweb: "  + Math.round(w.loaded/1000000) + " MB loaded")
			}
			}
		).then(sers => {
              var params_arr = []

		  	  TheDicomReader = new DicomReader();
		  	  for (var k = 0;k < sers.length;k++)
		  	  {
		  	      var p = {}
                  p.URLType = 'localfile';
                  p.fileID = params.fileID
                  p.filename = "dicomweb"
                  p.buffer = new Uint8Array(sers[k]);
                  p.callback = params.callback;
                  p.progressSpinner = KViewer.cacheManager.progressSpinner
                  params_arr.push(p);
		  	  }
              TheDicomReader.loadDicoms(params_arr,
                        function (loadparams)
                        {
                            for (var k = 0; k < loadparams.length;k++)
								KViewer.dataManager.loadData(loadparams[k]);

                            KViewer.cacheManager.update();

                        },KViewer.cacheManager.progressSpinner);
      
		})
  }
  
  function loadDataFromServer(params)
  {
    if(params.fileID == undefined)
     return
      
	// fileID is actually a search pattern from autoLoader. special tratment: fileID is used as searchpattern. I
    // exception: meta files or PACS files, e.g. from a pacs query
	if(!$.isNumeric(params.fileID))
	{ 
		if (params.fileID.substring(0,5) == 'meta_' )
		{

		}
		else if (params.fileID.substring(0,5) == 'SURF_' )
		{

		}
		else if (params.fileID.substring(0,4) == 'DBS_' )
		{

		}
		else if (params.fileID.substring(0,10) == "ROI_ATLAS_")
		{
		    var ids = params.fileID.substring(10).split("_"); 
			var atlas = that.getFile(ids[0])
			if (atlas == undefined)
			{
				atlas = that.getFile(ids[0] + "_" +ids[1]);
				KViewer.atlasTool.getROIfromSinglelabel(atlas,ids[2],atlas.content.labels[ids[2]].name,atlas,params.callback,params.progressSpinner);
			}
			else
				KViewer.atlasTool.getROIfromSinglelabel(atlas,ids[1],atlas.content.labels[ids[1]].name,atlas,params.callback,params.progressSpinner);
			return;
		}
		else if (params.fileID.substring(0,7) != 'PACS://' )
		{
			// this will only work from drag of pacs dialog.

		}
		else // fileID seems to be an autoloader pattern
		{
			params.autoLoaderPattern = params.fileID;     
			for (var id in files)
			{
				if( files[id].autoLoaderPattern  == params.fileID) 
				{
					if (params.callback)
						params.callback(files[id]);
					return;
				}     		
			}
		}
	}


    // check if file is already loaded and take from list if yes
    var fids = getFile(params.fileID,params);
    if (fids == 'proxy')
    {
    	return;
    }
    else if (fids != undefined)
    {
    	if (params.callback)
       		params.callback(fids);
        return;
    }

    // todo: in case of viewer only!
	var docid = currentModule + '_' + params.fileID; 


	function execServerRequest()
	{
		var fileURL   = myownurl().split("?")[0]; 
		var xhr = new XMLHttpRequest();
		var now = new Date();
		xhr.open('POST', fileURL + '?time=' + now.getTime()+'&asuser='+userinfo.username, true);
		xhr.setRequestHeader("Cache-control", "max-age:10");
		xhr.setRequestHeader("Content-type", "application/x-www-form-urlencoded");
		xhr.responseType = 'arraybuffer';

		var sigid = signalhandler.attach("close",function() {
			xhr.abort();
			params.progressSpinner();
			signalhandler.detach("close",sigid);
		});

		xhr.onload = function(e) { 
			signalhandler.detach("close",sigid);
			processLoadedFile(params,xhr)	
		}
		xhr.onreadystatechange = function() {
			if (xhr.readyState === 4)
			{   //if complete
				if(xhr.status === 200)
				{  //check if "OK" (200)
					//success
				} 
				else if(xhr.status === 404)
				{
				  alertify.error("HTTP error 404:\nFile not found.\nMost likely due to missing x-sendfile permissions, or a wrong ROUTE" );
				  console.log(xhr.result);
				  params.progressSpinner()
				  params.callback(undefined);
				  return;

				}
				else if(xhr.status === 0)
				{
					params.progressSpinner();
					xhr.abort();
				}
				else
				{
					params.progressSpinner();
					alertify.error("Connection to server lost!");
					xhr.abort();
				}
			} 
		}

		xhr.onprogress = function(pev) {
			if (params.progressSpinner != undefined && pev.total > 0)
			 params.progressSpinner(pev.loaded/pev.total,function() {xhr.abort() } ); };
	    var json = params.json;
	    if (json == undefined)  
	    	json = {project:currentModule}; // projectmode
	    else if (json.project == "")
	    	json.project = currentModule;   // ??
		var addjson = "&json=" + JSON.stringify(json);
		xhr.send('fileID=' + params.fileID + addjson);
	}


	if (storage == undefined || params.autoLoaderPattern != undefined)
		execServerRequest();
	else
	    storage.getContents(docid).then(function(result) {
			if (result == undefined | result == "")
				execServerRequest();
			else
			{				
				var fileinfo = JSON.parse(result);
 				setTimeout(function(){
 					if (params.progressSpinner != undefined)
 						 params.progressSpinner("checking for file changes"); 

					ajaxRequest('command=get_fileidentifier&json=' + JSON.stringify({fileID:fileinfo.ID}) ,
						function(e){
							if (e.identifier == fileinfo.identifier || e.identifier == "")
							{
								storage.getAttachment( docid, 'blob' ).then(function(data) {
										if (data != undefined)
										{
											if (params.progressSpinner != undefined)
												params.progressSpinner("Retrieving from local disk cache")
											that.loadData({fileID:params.fileID, autoLoaderPattern:params.autoLoaderPattern,file:data,URLType:'cachefile',callback:params.callback,intent:params.intent,fileinfo:fileinfo,progressSpinner:params.progressSpinner});
										}
										else
											console.log("Data in local disk cache corrupt! Clean your cache!");
									});
							}
							else
							{
								console.log("cache was not found to be up-to-date, reloading");
								storage.rm(docid).then(execServerRequest);

							}

						});
 				   },0);


		     	}

	     	});

  }


  /** This is the onload callback of the xhr request. It processes/interprets
  	   the received binary/text data, e.g. interpreting as nifti/track file, parsing of csv, etc. and
  	   it registers the data in the local cache and in the largeLocalStorage.
  	   @param {object} params - parameters of file loading task
  	   @param {string} params.fileID - sqlid/filepath of file loaded    
  	   @param {string} params.URLType - from where (serverfile/localfile)
  	   @param {callback} params.callback - once we have processed the file callback(fileObject) is called
  	   @param {callback} params.progressSpinner - can be used to show processing progress
  	   @param {object} xhr - the xhr request object upon 
  	   @function */
  function processLoadedFile(params,xhr)
  {
    var response;

    function finalize()
	{
		  if (fileObject.content !== false)
		  {     
		    if (fileObject.fileID.substring(0,5) != 'meta_')
		    {
				files[fileObject.fileID] = fileObject;
				KViewer.cacheManager.update();

//todoMRC				  
			  if (0) //params.intent && params.intent.roi)
			  {
			  	  if(params.intent.color!=undefined)
			  	  	fileObject.color = params.intent.color
				  KViewer.roiTool.pushROI(fileObject.fileID, "untitled", "frommaskfile",function(fobj)
				  {
				  	 if (params.intent.ccanalysis)
				  	 	createConnCompAnalysis(fobj);   
					 if (params.callback)
					   params.callback(fobj);		    
				  	 	               
				  });
				  return;
			  }

				


				if (fileObject.fileinfo && fileObject.fileinfo.filesize > 250000) // only cache large files
				{			
					if (params.URLType == 'serverfile' & storage != undefined) 
					{

						if (state.project_user.localstoragesizeMB*1000000 < storage.size )
							storage.rmOld(tryToSaveInCache,fileObject.fileinfo.filesize);
						else
							tryToSaveInCache();
							
						function tryToSaveInCache()
						{
							var docid = currentModule + '_' + params.fileID; 
							var blob = new Blob([response], {type: 'application/octet-binary'});
							var finfo = JSON.parse( xhr.getResponseHeader('DPX-fileinfo') );
							finfo.timeOfInsertion = (new Date()).getTime();
							storage.setContents(docid,JSON.stringify(finfo))
							.then(function() {
								storage.setAttachment(docid, 'blob',blob).
								then(function(){

								})
								.catch(function() {
									storage.rm(docid) 
									console.log("failed to cache in local storage")
								})					
							})
							.catch(function() {					
								storage.rm(docid) 
								console.log("failed to cache in local storage")
							})
							
							
						}
					}
				 }
		     }
 			 if (params.callback)
			   params.callback(fileObject);
		     
		 
		  }
  	  }




    var fileObject = new Object();
    fileObject.fileID = params.fileID;

    // localfile has other result structure
    if(params.URLType === 'localfile' | params.URLType === 'foreignurl')
    {
      if(xhr.customBuffer !== undefined)
      	xhr.response = xhr.customBuffer;
      else if (xhr.result != undefined)
      	xhr.response = xhr.result;

      if (params.filename == undefined || params.URLType === 'foreignurl')
      	params.filename = params.url.split("/").pop();

      if (params.URLType === 'foreignurl' && params.intendedName != undefined) 
        params.filename = params.intendedName;
    
      
      if (params.filename.search("//") > -1)
      	fileObject.filename = params.filename.split("//")[1];
      else
        fileObject.filename = params.filename;

      fileObject.fileinfo = params.fileinfo;
      if (fileObject.fileinfo == undefined)
      	fileObject.fileinfo = {};
      fileObject.fileinfo.filesize = xhr.response.byteLength,
      fileObject.fileinfo.SubFolder = params.SubFolder;
      
   
	  if (params.file && params.file.local)
	  {
          

	  	  var p = fileObject.filename.split("/")
	  	  fileObject.filename = p[p.length-1];
	  	  fileObject.fileinfo.filename = p[p.length-1];
	  	  fileObject.fileinfo.SubFolder = p.slice(0,-1).join("/");
	  }
	  else if (params.file && params.file.path)
	  {
		  fileObject.filename = params.file.name;
		  fileObject.fileinfo.filename = fileObject.filename;
		  fileObject.fileinfo.SubFolder = params.file.path.substring(0,params.file.path.length-params.file.name.length-1);

	  }


      runningID++;
    }
    else if (params.URLType === 'cachefile')
    {
      xhr.response = xhr.result;
      fileObject.fileID = params.fileinfo.ID;
      fileObject.filename = params.fileinfo.Filename;
      fileObject.fileinfo = params.fileinfo;

    }
    else  // server file
    {
      fileObject.filename = xhr.getResponseHeader('DPX-filename');
      fileObject.fileinfo = JSON.parse(xhr.getResponseHeader('DPX-fileinfo'));
      try {
          fileObject.seqinfo = JSON.parse(xhr.getResponseHeader('DPX-jsoninfo'));
      } catch(err) {}
      fileObject.error =  xhr.getResponseHeader('DPX-error');
      if (xhr.getResponseHeader('DPX-note'))
      {
      	alertify.error(xhr.getResponseHeader('DPX-note'));
      }


      try // coregistration info for current study
      {
          var coreginfo = JSON.parse(xhr.getResponseHeader('DPX-coreginfo'));
          fileObject.coreginfo = coreginfo;
			
			var coregmat = fileObject.coreginfo.spm_coregmat
			var psid = fileObject.fileinfo.patients_id + fileObject.fileinfo.studies_id;
			that.setCoregInfo(psid, coreginfo)

          //console.log(studycoreg)
      } 
      catch(err) {}

    }


	  if (params.SubFolder)
	 	 fileObject.fileinfo.SubFolder = params.SubFolder;

    response = xhr.response;
    var uint8Response = new Uint8Array(response);

    if (fileObject.error !== undefined & fileObject.error !== null)
    {
//    	var err = "Sorry, no match: " + decodeURIComponent(fileObject.fileID);
    	var err = fileObject.error;
    	console.warn(fileObject.error.replace(/newline/g, "\n"));
    	if (params.onerror != undefined)
    		params.onerror(err);
    	else
    	{
				
			alertify.lazy_error(err,"dberror");

        	//also log the content...
        	if(response.byteLength < 10000)
        		console.log(ab2str( new Uint8Array(response) ));
    	}
        if (params.progressSpinner)
        	params.progressSpinner()
        params.callback(undefined);
        return;
    }


    if(xhr.status === 404)
    {
      $.notify("Oops. An error occured: 404:\nFile not found.\nThis is most likely due to missing x-sendfile permissions, or a wrong :ROUTE:.", "error" );
      console.log(xhr.result);
      params.progressSpinner()
      params.callback(undefined);
      return;

    }

    if (fileObject.filename == undefined)
    {
        $.notify("Sorry. The file was not found","error");
        params.progressSpinner()
        params.callback(undefined);
        return;
    }



	// set the ID again, just in case it was an SQL search.
	if (params.autoLoaderPattern != undefined)
	{	
		fileObject.autoLoaderPattern = params.autoLoaderPattern;
		fileObject.fileID = fileObject.fileinfo.ID; 
	}





    if (fileObject.fileinfo.fileseries)
    {
      	  var finfo = fileObject.fileinfo;
      	  var fobjs = [];
      	  var pos = 0;
		  for (var k = 0; k < finfo.filesize.length;k++)
		  {
				var fobj = new Object();
				fobj.fileID = params.fileID;
		  	    fobj.filename = finfo.filenames[k];
                fobj.fileinfo = fileObject.fileinfo;
				fobj.content = new Uint8Array(uint8Response.buffer.slice(pos,pos+finfo.filesize[k]));
                pos = pos + finfo.filesize[k];
                fobjs.push(fobj);
		  }

		  var bruker = BrukerReader.checkForBrukerData( fobjs)
		  if (bruker !== undefined )
		  {
				BrukerReader.vis2dseq2Nifti(bruker.headerfile,bruker.datafile,fileObject.fileinfo.Filename, 0,function(fobj)
				{
					params.callback(fobj);
				});

			    return;
		  }


   }




	var cnter = 0;	
	if(fileObject.filename.search('\\.gz') > -1 )
       if (params.progressSpinner != undefined)
       	 params.progressSpinner("unpacking");      

    if(fileObject.filename.search('\\.gz') > -1 | fileObject.filename.search('\\.mgz') > -1 )
    {
    	//pakoWorker = 1;
		
    	if (!pakoWorker)
    	{
    		pako.stat =0;
    		console.time("pako")
    		processfileObject(pako.inflate(uint8Response))
    		console.timeEnd("pako");
    	}
    	else
    	{
    		
			executeUnpackWorker(uint8Response,params.progressSpinner,function(e)
			{
				if (!e.error)
				{
					response = e.back; // necessary to transfer transferable back
					processfileObject(e.arraybuf);
				}
				else
				{
			      logProcess(e.error)
				}
			});
    	}
    }
    else if(params.filetype == "analyze75")
    {
			zip.workerScriptsPath = "zip/";
			zip.useWebWorkers = false;
			zip.createReader(new zip.BlobReader(new Blob([uint8Response])), function(reader) {
				// get all entries from the zip
				reader.getEntries(function(entries) {
					reader.close();
					var fis = {}
					for (var j = 0; j < entries.length; j++)
						if (!entries[j].directory)
							fis[entries[j].filename] = entries[j]
					if (fis["hdr"] !=undefined &&  fis["img"] != undefined)
					{
						prepA75_HdrImg(fis,params.progressSpinner,fileObject,processfileObject)
					}

				});
			}, function(err) {
				alertify.error("Error during reading zipfile: " + err.toString());
			});
    }
	else
	{	    
		/* in some cases, we want to convert a bmp to a nifti, so we have all drawing tools etc available 
		must implement this here, image conversion is callback based (img.attr = ... onload)
		*/

		if ( state.viewer.loadBitmapAsNifti &&  
			( fileObject.filename.search('\\.jpeg') > 0 | fileObject.filename.search('\\.jpg') > 0 | fileObject.filename.search('\\.png') > 0 | fileObject.filename.search('\\.tiff') > 0 | fileObject.filename.search('\\.bmp') > 0)
			)
			{
				fileObject.filename += '.nii';
				fileObject.content = bmpToNIFTI(uint8Response, processfileObject);

		}
		else
			processfileObject(uint8Response);
	}
		

	function processfileObject(uint8Response)
	{
		if(fileObject.filename.search('\\.nii') > 0 | fileObject.filename.search('\\.mgh') > 0  | fileObject.filename.search('\\.mgz') > 0  | fileObject.filename.search('\\.nrrd') > 0)
		{
			fileObject.contentType = 'nii';
			//try
			{
				// parse the NIFTI
				var buf = uint8Response.buffer;
				var niibuf;
				if (fileObject.filename.search('.nrrd') > 0 )
					niibuf = nrrd.parse(buf)
				else if (fileObject.filename.search('.mgh') > 0 | fileObject.filename.search('.mgz') > 0)
					niibuf = parse_mgh(buf)
				else
					niibuf = parse(buf)

				// prepare NIFTI
				fileObject.content = prepareMedicalImageData(niibuf, fileObject, params.intent);


				if (fileObject.seqinfo != undefined)
				{
					fileObject.seqinfo.voxSize = fileObject.content.voxSize;
					fileObject.seqinfo.sizes = fileObject.content.sizes;
				}
				fileObject.content.seqinfo = fileObject.seqinfo;

				if (params.intent != undefined)
				{
					if (params.intent.atlas)
					{
						KViewer.atlasTool.addAtlas(fileObject);
						fileObject.project = params.intent.project;	          	  
					}
				}

			}
			/*
			catch(e) 
			{    
				alertify.error("error preparing image data " + fileObject.filename + ": " + e);      
				fileObject.contentType = 'unknown';        
			}*/

      }
      else if ( fileObject.filename.search('\\.jpeg') > 0 | fileObject.filename.search('\\.jpg') > 0 | fileObject.filename.search('\\.png') > 0 | fileObject.filename.search('\\.tiff') > 0 | fileObject.filename.search('\\.bmp') > 0)
      {
        fileObject.contentType = 'bmp';
        fileObject.content =  uint8Response;

      }
      else if ( fileObject.filename.search('\\.rtstruct') > 0)
      {
        fileObject.contentType = 'rtstruct';
        if (response.constructor.name == 'ArrayBuffer')
        	fileObject.content =  JSON.parse(ab2str(new Uint8Array(uint8Response)));
		else
        	fileObject.content = response;

        	

      }      
      else if (fileObject.filename.search('\\.txt') > 0 | fileObject.filename.search('\\.stats') > 0 | fileObject.filename.search('\\.bexclude') > 0 | fileObject.filename.search('\\.bval') > 0 | fileObject.filename.search('\\.bvec') > 0  | fileObject.filename.search('\\.time') > 0)
      {
        fileObject.contentType = 'txt';
        //fileObject.content = ab2str( uint8Response);
        // umlaute did not work so far, with this they do 
        if (typeof response == "string")
        	fileObject.content = response;
        else
        	fileObject.content = utf8ab2str( uint8Response);
      }
      else if (fileObject.filename.search('\\.csv') > 0)
      {
        fileObject.contentType = 'tab';
        fileObject.content = ab2str( uint8Response);
      }
      else if (
               fileObject.filename.search('\\.odt')>0 |
               fileObject.filename.search('\\.doc')>0 |
               fileObject.filename.search('\\.docx')>0 |
               fileObject.filename.search('\\.ppt')>0 |
               fileObject.filename.search('\\.pptx')>0)
      {
        fileObject.contentType = 'doc';
        fileObject.content = ab2str( uint8Response);
      }
  	 else if (fileObject.filename.search('\\.pdf') > 0)
      {

      	  var blob = new Blob([uint8Response], {type: 'application/pdf'});

		  var a = document.createElement("a");
		  a.style = "display: none";
		  document.body.appendChild(a);
		  var url = URL.createObjectURL(blob);
		  a.href = url; // + "?" + fileObject.fileinfo.SubFolder + "/" +  fileObject.fileinfo.Filename ;
		 // a.download = 'myFile.pdf'; // gives it a name via an a tag
		  a.target = "_blank_";
		  a.click();

          params.callback(undefined);
	
	      return;
	      /*

	//	const fileObjectURL = URL.createObjectURL(blob); 
      	window.open(fileObjectURL,"mafile.pdf");
      	params.callback(undefined);
      	return;
        fileObject.contentType = 'doc';
        fileObject.content = ab2str( uint8Response);
           */
      }      
	  else if (fileObject.filename.search("\\.ano\\.json") != -1  ||  (fileObject.fileinfo.Tag != undefined && fileObject.fileinfo.Tag.search('/ANO/')>-1))
       {
       	  try {
          	fileObject.content = JSON.parse(utf8ab2str( uint8Response)); }
          catch(err)
          {
          	 alertify.error("Error during parsing json");
          	  params.callback(undefined);
          	 return;
          }

		  var sets;
		  if (params.intent && params.intent.autocreate_ano)
		  {
		  	 sets = markerProxy.newSet( params.intent.autocreate_ano);  
		  	 params.obj = markerProxy.import(fileObject.content.annotations,sets);
			if (KViewer.markerTool.isinstance)
				KViewer.markerTool.update();
		  	 
		  }
		  else
          	 sets = markerProxy.loadAnnotations(fileObject);

          // only show markerTool if no panel / panel not visible
          if(markerProxy.currentSet &&  markerProxy.currentSet.markerPanel && markerProxy.currentSet.markerPanel.panelvisible)
          {
				// do nothing ( no show )
          }
          else
          {
          	if ( !KViewer.markerTool.enabled )
	          	 KViewer.markerTool.toggle();
          }
          
		  params.callback();
          return;
       }
  	    else if (fileObject.filename.search("\\.batch\\.json") != -1 )
  	    {
  	    	if (!commandDialog.visible)
  	    	    commandDialog.toggle();
  	    	commandDialog.pasteit(utf8ab2str( uint8Response));
  	    	params.callback();
  	    	return;
  	    }

     /* else if (fileObject.filename.search('\\.reading') > 0)
      {
		fileObject.formid = ( xhr.getResponseHeader('DPX-formid') );
        fileObject.contentType = 'json';
        fileObject.content = utf8ab2str( uint8Response);

      }*/
      else if (fileObject.filename.search('\\.json') > 0 || fileObject.filename.search('\\.reading') > 0)
      {
        fileObject.contentType = 'json';
        fileObject.content = utf8ab2str( uint8Response);
        if ( fileObject.content == ""  && typeof response == "string")
         	fileObject.content = response;
        if (params.URLType == 'localfile')
        {
			var tmp = JSONparse_lazy(fileObject.content);
			if (tmp == undefined )
			{
				if (params.callback)
				params.callback(undefined);
				return;
			}


			if (tmp.content)
				fileObject.content = JSON.stringify(tmp.content);
			if (tmp.tag)
				fileObject.fileinfo.Tag = tmp.tag;
        }
		if ((fileObject.fileinfo.Tag || "").search('/TCKSEL/')>-1 | fileObject.filename.search('\\.tck\\.json') > 0 )
		{
              var tcksel = JSON.parse(fileObject.content);
              if (tcksel.assoc == undefined)
              {
                    if (tcksel.content != undefined & tcksel.content.assoc != undefined)              	
                        tcksel = tcksel.content;
                    else
                    {
					 alertify.error("Json seems not to be a valid fibeselection.","error");
					 params.callback(undefined);
					 return;
                    }
              }


              var par = {URLType:'serverfile',fileID:tcksel.assoc.fileID, json:params.json,
              			 progressSpinner:params.progressSpinner,

						 callback: function(fp){
							  if (fp == undefined)
							  {
							  	  var files = KViewer.dataManager.getFileList();
							  	  for (var k = 0; k < files.length; k++)
							  	  {
							  	  	 var fobj = KViewer.dataManager.getFile(files[k]);
							  	  	 if (fobj.content && fobj.content.md5 == tcksel.assoc.md5)
							  	  	 {
							  	  	 	fp = fobj;
							  	  	 }
							  	  }
							  }



						 		
						      if (fp == undefined)
						      {
						      	 alertify.error("Tracts associated with selection not found, link broken. " +
						      	  "Load correct associated tck into workspace and try again.","error");
								 params.callback(undefined);
						      }
						      else
						      {					 	
								  var fibs = KViewer.dataManager.getFile(fp.fileID) ;
								  if (params.intent == undefined)
								  	params.intent = {};
								  if (params.intent.select == undefined)
								  		params.intent.select = 'allselections';								  
								  if (fibs.content.selections == undefined)
									  fibs.content.selections = [];
								  //fibs.content.selections = fibs.content.selections.concat(tcksel.selections);
								  fibs.content.selections = tcksel.selections;
								  fibs.tckjsonref = fileObject;
								  if (params.callback)
								  	params.callback(fibs);
								  
								  KViewer.obj3dTool.update();
						      }
						  } };


			  if (electron)
			  {
			  	 par.URLType = "localfile";
			  	 par.filename = tcksel.assoc.subfolder + "/" + tcksel.assoc.filename;
			  	 par.file = {name: par.filename ,local:true}
			  }


			  var files = KViewer.dataManager.getFileList();
			  var found = false;
			  for (var k=0;k<files.length;k++)
			  {
			  	  var file = KViewer.dataManager.getFile(files[k]);
			  	  if (file.content.md5 == tcksel.assoc.md5)
				  {
				  	 par.fileID = files[k];
				  	 found = true;
				  	 break;
				  }
			  }

			  if (!found)
			  {
				  var files = KViewer.dataManager.getFileList();
				  for (var k = 0; k < files.length; k++)
				  {
					 var fobj = KViewer.dataManager.getFile(files[k]);
					 if (fobj.content && fobj.filename == tcksel.assoc.filename && fobj.fileinfo != undefined && tcksel.assoc.subfolder == fobj.fileinfo.SubFolder)
					 {
					//	alertify.error("Warning: tracts associated with selection by md5 hash not found, used association by name");
						tcksel.assoc.md5 = fobj.content.md5;
						par.fileID = files[k];
						break;
					 }
				  }
			  }

              KViewer.dataManager.loadData(par);

//			  if (found)
//                	KViewer.dataManager.loadData(par);
  //            else
    //          	 par.callback();


			  return
		}
 		else if (fileObject.filename.search('\\.cc\\.json') > 0)
 		{
			if (typeof fileObject.content != "object")
			{
  				KViewer.obj3dTool.prepareConmatData(fileObject,function(txt) {
		    	   params.progressSpinner(txt);      
		 		}, function()
		 		{
					finalize();
					KViewer.obj3dTool.addObject(fileObject);
		 		});
		 		return;

			}
       		

 		}
 		else if ( (fileObject.fileinfo.Tag || "").search('workstate')>=0 )
 		{
 				KViewer.closeAll(function()
 				{
					var sharedLink = JSONparse_lazy(fileObject.content);
					if (fileObject.fileinfo && fileObject.fileinfo.SubFolder)
						sharedLink.absolutePath = fileObject.fileinfo.SubFolder;
					params.progressSpinner();  
					openSharedLink(sharedLink,function() { 
                        if (params.callback)
                            params.callback();
					});
 				});
				return;
 		}
 		else if ( (fileObject.fileinfo.Tag || "").search('ironsight')>=0 )
 		{
 				var state = JSONparse_lazy(fileObject.content);
 				if (!ironSight.isVisible())
 					ironSight.toggle()
 				setTimeout(function() { ironSight.import(state); params.progressSpinner();   },1000)
				
 				return;
 		}
 		else
 		{


 		}



      }
      else if(fileObject.filename.search('\\.gii') > 0 | fileObject.filename.search('\\.stl') > 0)
      {
        fileObject.contentType = 'gii';
 	    KViewer.obj3dTool.prepareSurfaceData(fileObject,uint8Response,function(txt) {
		    	params.progressSpinner(txt);      
		 },
		 function() {
			 if (fileObject.content == undefined)
			 {
				 $.notify("Sorry. Not a valid surface file","error");
				 if (params.callback)
					params.callback(undefined);
				 return;
			 }
			 fileObject.contentType = 'gii';
			 KViewer.obj3dTool.addObject(fileObject);
			 finalize();
			 return;
		 });
		 return;

      }

      
      else if (fileObject.filename.search('.tck') > 0 | fileObject.filename.search('.trk') > 0)
      {      	
		 KViewer.obj3dTool.prepareFiberData(fileObject,uint8Response,function(txt) {
		 	 if (params.progressSpinner != undefined)
		    	params.progressSpinner(txt);      

		 },
		 function() {
			 if (fileObject.content == undefined)
			 {
				 $.notify("Sorry. Not a valid or empty tract file","error");
				 if (params.callback)
					params.callback(undefined);
				 return;
			 }
			 fileObject.contentType = 'tracts';
			 KViewer.obj3dTool.addObject(fileObject);
			 finalize();
			 return;
		 });
		 return;
      }

      else   if( BrukerReader.checkForBrukerData( [fileObject] ) !== undefined )
	  {
		 fileObject.content = uint8Response;
		 params.callback(fileObject);
		 return;
	  }
	  else if (fileObject.filename.search('\\.dcm') > 0)
	  {
		  if (typeof TheDicomReader != "object")		  
		  	  TheDicomReader = new DicomReader();
		  params.filename = fileObject.filename;
		  params.buffer = uint8Response;
		   TheDicomReader.loadDicoms([params], function(x)
		   {
			  var fobj = x[0];
			  if (fobj.filename.search("\\.nii") >= 0)
			  {
			  	  fobj.contentType = "nii";			  
			  	  // not yet done
			  	  console.log('not yet implemented');
			  }
			  else if (fobj.filename.search("\\.rtstruct") >= 0)
			  {
			  	  fobj.contentType = "rtstruct";			  
			  	  fobj.content = fobj.buffer;
			  }
			  fobj.filename = fileObject.filename;
			  fobj.fileID = fileObject.fileID;
			  fobj.fileinfo = fileObject.fileinfo;

			  params.callback(fobj)
			  files[fobj.fileID] = fobj;
			  KViewer.cacheManager.update();			   
  	   	   });

  	   	   return;
	  }
      else
      {
        fileObject.contentType = 'undefined';
        fileObject.content = false;
        alertify.error("Sorry. The file type is not supported \n"+fileObject.filename );
        if (params.callback)
        	params.callback(undefined);
        return;
      }

	  finalize();

	}
  //  },0);


      
  }



	function prepA75_HdrImg(fis,progressSpinner,fileObject,processfileObject)
	{

			function progress(str)
			{     
			  if (progressSpinner != undefined)
					 progressSpinner("unpacking");      
				else
					console.log(str);
			}

			fis['hdr'].getData(new zip.BlobWriter(), function(blob_hdr)
			{
				fis['img'].getData(new zip.BlobWriter(), function(blob_img)
				{
				   blob_hdr.arrayBuffer().then(function(buffer_hdr) {
				   blob_img.arrayBuffer().then(function(buffer_img) {
						var cat = new Uint8Array(buffer_hdr.byteLength+buffer_img.byteLength);
						cat.set(new Uint8Array(buffer_hdr))
						cat.set(new Uint8Array(buffer_img),buffer_hdr.byteLength);
						var view = new DataView(cat.buffer)                                
						view.setInt32(0, buffer_hdr.byteLength)
						view.setFloat32(108,buffer_hdr.byteLength)
						view.setUint8(344,110)
						view.setUint8(345,43)
						view.setUint8(346,49)
						view.setUint8(347,0)


						 fileObject.filename = fileObject.filename + ".nii";
						 processfileObject(cat)


				   })})

				}, function(current, total) { progress("unzipping " + math.round(current / total * 100) + "%"); })
			}, function(current, total) { progress("unzipping " + math.round(current / total * 100) + "%"); })


	}



  /** clears all references to all loaded data
   *  @function */
  function clearMemory()
  {
  	  if ( KViewer.roiTool && KViewer.roiTool.isinstance)
	  	 KViewer.roiTool.clearAll();
	  if (typeof KWMQLPanel != "undefined")
	  {
		  for (var k in KWMQLPanel.panels)
			 KWMQLPanel.panels[k].close();
		  KWMQLPanel.panels = {};
	  }	  
	  
	  if (KViewer.obj3dTool.isinstance)
	  {
		  var obs = Object.keys(KViewer.obj3dTool.objs);
		  for (var k = 0; k< obs.length;k++)
		  {
		  		if ( KViewer.obj3dTool.objs[obs[k]].content.octreeWorker)
		  		 	KViewer.obj3dTool.objs[obs[k]].content.octreeWorker.kill();
				delete KViewer.obj3dTool.objs[obs[k]].content;
		  }

		  KViewer.obj3dTool.objs = {};
		  KViewer.obj3dTool.update();
	  }
	  
	  if (KViewer.atlasTool.isinstance)
	  {
		  KViewer.atlasTool.defField = undefined;
		  KViewer.atlasTool.clearAll();
		  KViewer.atlasTool.update();
	  }
	  
      var obs = Object.keys(files);
      for (var k = 0; k< obs.length;k++)
      {
		 //if (KViewer.atlasTool.objs[files[obs[k]].fileID] == undefined)
		 {
		 	delete files[obs[k]].content;
		 	delete files[obs[k]];
		 }
      }
      
      KViewer.cacheManager.update();

      // clear the study coreginfos
      that.coregInfos = {};

  }
  that.clearMemory = clearMemory;



  /** clones a nifti as a ROI 
   *  @function */
  function cloneAsROI(id,name,lim,params)
  {
      var fobj = getFile(id);
      var newobjs = [];
      if (lim == "frommultiroifile")
      {
        var labels = {};
        var tot = fobj.content.sizes[0]*fobj.content.sizes[1]*fobj.content.sizes[2];
        for (var k=0;k < tot;k++)
        {
            var v = fobj.content.data[k];
            if (v == 0) continue;
            if (labels[v] == undefined) labels[v] = true;
            if (Object.keys(labels).length>10)
              {
            //    alert("too many labels");
                break;
              }
        }
        
        for (var k in labels)
        {
            var newobj =  clone(fobj,fobj.filename+"_"+k,"label"+k);
            files[newobj.fileID] = newobj;
            newobj.filename = newobj.filename.replace(".nii","");
            newobj.filename = newobj.filename.replace(".gz","");
            newobj.label = parseInt(k);
            newobjs.push(newobj);
        }


      }
      else if (lim == "frommaskfile")
      {
         var newobj = fobj;
         newobj.modified = false;
         files[newobj.fileID] = newobj;
         newobj.filename = newobj.filename.replace(".nii","");
         newobj.filename = newobj.filename.replace(".gz","");
         newobj.fileinfo.Tag = "/mask/" + newobj.fileinfo.Tag;
         newobjs = [newobj];

      }
      else // from other image file by thresholding/zero init
      {
       
         var newobj =  clone(fobj,name,lim);
         files[newobj.fileID] = newobj;
         newobj.modified = true;
         newobj.filename = newobj.filename.replace(".nii","");
         newobj.filename = newobj.filename.replace(".gz","");
         newobj.fileinfo.patients_id = fobj.fileinfo.patients_id;
         newobj.fileinfo.studies_id = fobj.fileinfo.studies_id;
         newobjs = [newobj];
      }


      KViewer.cacheManager.update();
      return newobjs;


      function clone(fobj,name,lim)
      {

		  if( KViewer.roiTool.mode4D || (params && params.sametdim))
		  	var fileObject = cloneNifti(fobj,name,'uint8', 'sametdim')
		  else
		  	var fileObject = cloneNifti(fobj,name,'uint8')

		  if (fileObject.fileinfo == undefined)
		  	fileObject.fileinfo = {};
		  fileObject.fileinfo.Tag = '/mask/';

		  // get a new ID
		  var roiid = "ROI_0";
		  var cnt = 1;
		  while (files[roiid]!=undefined)
			  roiid = "ROI_" + cnt++;

		  if (fobj.intendedROIid != undefined)
		  	  roiid = fobj.intendedROIid;

		  fileObject.fileID = roiid;

		  // interpretaion
		  if (lim)
		  {
		  	var offs = fobj.content.currentTimePoint.t*fobj.content.widheidep;
		  	if (KViewer.roiTool.mode4D) 
		  	    offs = 0
		  	var thelim = parseFloat(lim.substring(5));
			if (lim.substring(0,5) == "lower")
			  for (var k = 0;k < fileObject.content.data.length;k++)
			  {
				  fileObject.content.data[k] = (fobj.content.data[k+offs] < thelim
											  & fobj.content.data[k+offs] != 0          )?1:0;
			  }
			else if (lim.substring(0,5) == "upper")
			  for (var k = 0;k < fileObject.content.data.length;k++)
				  fileObject.content.data[k] = (fobj.content.data[k+offs] > thelim)?1:0;
			else if (lim.substring(0,5) == "label")
			  for (var k = 0;k < fileObject.content.data.length;k++)
				  fileObject.content.data[k] = (fobj.content.data[k] == parseInt(lim.substring(5)))?1:0;
		  }
		  else
			for (var k = 0;k < fileObject.content.data.length;k++)
				fileObject.content.data[k] = 0;

          return fileObject;
      }



  }
  that.cloneAsROI = cloneAsROI;

  
  return that;
}







function createLoadParamsFileDrop(e, callback, progress)
{

    function validFileExt(p)
    {
        var exts = ['trk','nii', 'tck', 'json', 'txt', 'jpeg', 'jpg', 'png', 'bmp', 'gii', 'pdf', 'csv', 'bval', 'bvec', 'bmat','mgh','nrrd' ,'mgz', 'stl', 'mat'];
        if (p.filename) // only for local files
        {
            for (var k = 0; k < exts.length; k++)
            {
                if (p.filename.search(RegExp(exts[k] + '$')) > -1)
                    // end of string search					
                    return true;
                if (p.filename.search(RegExp(exts[k] + '.gz$')) > -1)
                    // end of string search					
                    return true;
            }
            return false;
        }
        else
            // always accept serverfiles
            return true;
    }

    function syncImport(params, finalcb)
    {

        // bruker 
        var bruker = BrukerReader.checkForBrukerData(params)
        if (bruker != undefined)
        {
            if (progress)
                progress("converting bruker data");
            setTimeout(function() {
                BrukerReader.loadBruker(bruker, function() {
                    niiImport();
                    progress()
                }, "img.nii");
            }, 1);
        }
        else
            dcmImport()


        function dcmImport()
        {
            // dicoms
            var dicomReader = new DicomReader();
            dicomReader.loadDicoms(params, function(p) {
                callback(p);
                niiImport()
            });

        }

        function niiImport()
        {
            // ordinray files
            callback(processParamsSet(params));
            if (finalcb)
                finalcb();
        }
    }





    function processParamsSet(params, str)
    {



        var loadParams = [];

        for (var k = 0; k < params.length; k++)
        {
            if (validFileExt(params[k]))
            {
                params[k].progressSpinner = progress;
                params[k].callback = function() {
                    progress()
                }
                ;

                if (str)
                    params[k].SubFolder = str.replace(/^\/|\/$/g, "");

                loadParams.push(params[k]);
            }
            else if (params[k].filename.search("\\.zip") > -1)
            {
                progress("analyzing archive");
                var loadParamsZip = [];
                var loadParamsOther = [];
                var freader = new FileReader();
                freader.onload = function(e) {
                    zip.workerScriptsPath = "zip/";
                    zip.useWebWorkers = false;
                    zip.createReader(new zip.BlobReader(new Blob([freader.result])), function(reader) {
                        // get all entries from the zip
                        reader.getEntries(function(entries) {
                            reader.close();
                            for (var j = 0; j < entries.length; j++)
                                if (!entries[j].directory)
                                {
                                    var subfolder = "";
                                    var name = entries[j].filename;
                                    var splitslash = name.lastIndexOf("/");
                                    if (splitslash != -1)
                                    {
                                        subfolder = name.substring(0, splitslash);
                                        name = name.substring(splitslash + 1);
                                    }

                                    entries[j].name = name;
                                    entries[j].SubFolder = subfolder;
                                    var p = createParamsLocalFile(entries[j], undefined, progress);
                                    p.name = name;
                                    p.SubFolder = subfolder;

                                    if (validFileExt(entries[j]))
                                        // this is plane valid file (no brukder or dicom)
                                        loadParamsZip.push(p);
                                    else
                                        loadParamsOther.push(p);


                                }
                            progress();
						 	if(loadParamsOther.length > 0)
							{
								
									var dicomReader = new DicomReader();
									dicomReader.loadDicoms(loadParamsOther, function(p) {
										callback(p);
									});

							}
							if(loadParamsZip.length > 0)
								  callback( loadParamsZip) ;		   // rest goes the normal way
                        });
                    }, function(err) {
                        progress();
                        alertify.error("Error during reading zipfile: " + err.toString());
                    });

                }
                readBufferFromFile(freader, params[k]);


            }
        }
        return loadParams;
    }
    // end processParamSet

    if (e.originalEvent)
        e = e.originalEvent;


    // file drop from local files
    var dt = e.dataTransfer;
    // this will not work in firefox, that case will be handled below.
    if (dt.items && dt.items[0] && dt.items.length > 0 && dt.items[0].webkitGetAsEntry && dt.items[0].webkitGetAsEntry())
    {
        var ientries = [];
        for (var k = 0; k < dt.items.length; k++)
            ientries.push(dt.items[k].webkitGetAsEntry());


        var workpackages = [];

        browseDir(ientries, undefined, "", function() {

            function runSync()
            {
                if (workpackages.length > 0)
                {
                    var p = workpackages[0];
                    workpackages = workpackages.slice(1);
                    syncImport(p.params_arr, runSync);
                }
            }
            runSync();
        });

        function browseDir(entries, parent, str, cb)
        {

            var params_arr = [];
            params_arr.parent = parent;

            for (var k = 0; k < entries.length; k++)
            {
                var entry = entries[k];
                var entry_ =  (entry || "").toString()
                if (  entry_ == "[object DirectoryEntry]" || entry_ == "[object FileSystemDirectoryEntry]"  || entry.isDir)
                {
                }
                else
                {
                    if (entry.error == undefined)
                    {
                        var tmp = createParamsLocalFile(entry, undefined, progress);
                        params_arr.push(tmp);
                    }
                    else
                        params_arr.push(entry);
                }
            }



            iterateEntries();

            function iterateEntries()
            {
                if (entries.length == 0)
                {
                    workpackages.push({
                        params_arr: params_arr,
                        str: str
                    });
                    cb();
                    return;
                }
                var entry = entries[0];
                entries = entries.slice(1);
                readSingleEntry(entry, iterateEntries);
            }


            function readSingleEntry(entry, cb2)
            {
                var entry_ =  (entry || "").toString()
                if (  entry_ == "[object DirectoryEntry]" || entry_ == "[object FileSystemDirectoryEntry]" || entry.isDir)
                {
                    var dirReader = entry.createReader();
                    var new_entries = [];
                    var readEntries = function() {
                        dirReader.readEntries(function(results) {
                            if (!results.length)
                            {
                                browseDir(new_entries, params_arr, str + entry.name + "/", cb2);
                            }
                            else
                            {
                                new_entries = new_entries.concat(toArray(results));
                                readEntries();
                            }
                        });
                    }
                    readEntries();

                }
                else
                {
                    /*	var tmp = createParamsLocalFile(entry, undefined, progress) ;							
							params_arr.push(tmp);
							params_arr.parent = parent;*/
                    cb2();
                }
            }




        }

    }
    // drop from cach table.
    // what to do? upload?
    else  if(isDragFromCacheTable(e))
    {
        alertify.error('Upload by drop not implemented yet.<br>Select a patient and use upload button instead.')
        //KViewer.cacheManager.prepTarget(e.target);
        //KViewer.cacheManager.uploadFiles(undefined, 0);
        return false;    
    }
    // file has size 0 -> probably a folder, not detected by webkitGetAsEntry above => probably we are in firefox.
    // fil.type would not work, if mime type is not registered in system, it woll also be "".
    else if( dt.files && dt.files.length > 0 && dt.files[0].size == 0)
    {
        alertify.error('Dropped item has size zero or is a folder. This is not suppored by your browser.')
        return false;    
    }
    else
    {

        var params = getloadParamsFromDrop(e, undefined, progress);
        syncImport(params);

    }

}
// end createLoadParamsFileDrop

