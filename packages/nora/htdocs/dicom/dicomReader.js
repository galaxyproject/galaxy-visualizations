


if (typeof electron == "undefined")
    electron = false;


if (typeof module != "undefined" && !electron)
{


    if (typeof daikon == "undefined")
        daikon = require('./daikon');

    if (daikon.papaya != undefined)
        papaya = daikon.papaya;

    var math = require("../../src/node/kmath.js");
    var path = require("path");

    function fullfile(arr)
    {
      if (!Array.isArray(arr))
        return arr;
      f = '';
      for (var  k = 0; k < arr.length-1;k++)
        f += arr[k] + '/';
      f += arr[arr.length-1];

      f = f.replace(/\/\//g,'/');

      return f;
    }


    function pid_hashfun(type,str,callback)
    {
        if(type.toLowerCase() == 'nohash')
        {
            callback( str );        
        }
        else
        {    
            var crypto = require('crypto');
            var shasum = crypto.createHash('sha1')
            shasum.update(str )
            callback(shasum.digest('hex'));        
        }
    }

    module.exports =
    {
        dicomReader:DicomReader(),
        dicomReaderFun:DicomReader
    }


}

if (typeof pid_hashfun == "undefined" && typeof SubtleCrypto != "undefined")
{

    function pid_hashfun(type,str,callback)
    {
        if(type.toLowerCase() == 'nohash')
        {
            callback(str)
        }
        else
        {
            function f(str) {
            return crypto.subtle.digest("SHA-1", new TextEncoder("utf-8").encode(str)).then(buf => {
                return Array.prototype.map.call(new Uint8Array(buf), x=>(('00'+x.toString(16)).slice(-2))).join('');
            });
            }
            f(str).then(callback);
        }
    }
}






function DicomReader()
{
    var that = new Object();

    // store all found series in this Object, indexed by suid
    var series = {} ;
    
    // async Solution: keep track of the read files
    var fileList;
   // var filesDone;

    var progress = function(x) {
        if (x != undefined)
         console.log(x) };
    var error_report = {};

    that.whendone = undefined;
    
    // can call this by an on drop / load event
    function readMultiFiles(files, whendone,progressSpinner)
    {
      var about_to_abort = false;
        
      // for debugging load script already in index.php
      if( typeof daikon == "undefined")
          scriptLoader.loadScript("dicom/daikon.js", scriptLoaded);
      else
          scriptLoaded();

      function scriptLoaded()
      {
         
        progress = progressSpinner;
        series = {};
        that.series = series;
        //filesDone  = [];
        that.whendone  = whendone;


        //var files = ev.target.files;
        fileList   = files;

        var numfiles = files.length;  
        
        function readSeries() {
            if (files.length>0) 
            {
                if (about_to_abort)
                    return;
                if (progress)
                    progress("Reading DCM Headers " + math.round(100*(1-files.length/numfiles)) + "%",
                            function() {
                                about_to_abort = true;
                                
                            });
                var file = files[0];
                files = files.slice(1);

                var reader = new FileReader();
                reader.onloadend = function (evt) 
                {
                    var ret = false;
                    if (evt.target && evt.target.readyState === FileReader.DONE) 
                    {
                        ret = readSingleDICOM(file, file.name, evt.target.result, readSeries);
                    }
                    else if (this.customBuffer)
                    {
                        ret = readSingleDICOM(file, file.filename, this.customBuffer.buffer, readSeries)
                    }
                    if (ret)
                       file.isdicom = true;
                            
                 };
                readBufferFromFile(reader, file )

            }        
            else
               dicom2nii(whendone );  
        }                
        readSeries();
      }
      return function() {about_to_abort=true;}

    }
    that.readMultiFiles = readMultiFiles;
    that.transform_suidmap = {}

    // parse the dicom content
    function readSingleDICOM(fileobj, name, buf, the_callback) 
    {   


        
        // function reads a single file, gathers important tags and appends it to the series array
        var data = new DataView(buf);
        daikon.Parser.verbose = false;
        if (data.byteLength == 0)
        { 
            console.warn("problem during conversion " + fileobj.filename + ", size 0B");            
            error_report.daikon = true;
            if (the_callback)
                the_callback(false)
            return false;
        }

        var image = daikon.Series.parseImage(data);
        if (image == undefined)
        { 
            error_report.daikon = true;
            if (the_callback)
                the_callback(false)
            return false;
        }

        if (image.ktags.SegmentLabel != undefined && image.ktags.SegmentLabel.multival != undefined && image.ktags.SegmentLabel.multival.length > 1)
        {
             var perframe = image.tags['52009230'].value;
             var labels = {};
             for (var k = 0; k < perframe.length;k++)
             {
                var i = perframe[k].value.findIndex((x) => x.key == "SegmentIdentificationSequence")
                var lnum = perframe[k].value[i].value[0].value[0].value[0]
                 if (labels[lnum] == undefined)
                     labels[lnum] = [];
                labels[lnum].push(k);
             }
             var buf = new Uint8Array(image.getPixelDataBytes());
             var framesz = buf.byteLength/perframe.length
             var SegmentLabels = Object.keys(labels)
             var subImages = [];
             for (var k = 0; k < SegmentLabels.length;k++)
             {
                  var subimage =daikon.Series.parseImage(data);
                  var numframes = labels[SegmentLabels[k]].length
                  var subbuf = new Uint8Array(framesz*numframes)
                  subimage.ktags.ImagePositionPatient.multival = []
                  subimage.ktags.NumberOfFrames.value[0] = numframes
                  subimage.ktags.SegmentLabel.value[0] = image.ktags.SegmentLabel.multival[k]
                  var fs = labels[SegmentLabels[k]]
                  for (var j = 0; j < fs.length;j++)
                  {
                     subimage.ktags.ImagePositionPatient.multival.push(image.ktags.ImagePositionPatient.multival[fs[j]])
                     subbuf.set(buf.slice(fs[j]*framesz,(fs[j]+1)*framesz)   , j*framesz)
                  }
                  subimage.ktags.ImagePositionPatient.value = subimage.ktags.ImagePositionPatient.multival[0]
                  var subbuftag = subimage.getPixelData()
                  subbuftag.value = new DataView(subbuf.buffer)
                  subImages.push(subimage);
             }

             iterate();
             function iterate()
             {
                 if (subImages.length == 0)
                 {
                     if (the_callback)
                         the_callback()
                 }
                 else
                     readDCM(subImages.splice(0,1)[0],iterate)
             }
                    
            
        }
        else        
            return readDCM(image,the_callback)


        function readDCM(image,callback)
            {
            // sort the images according to patient, StudyInstanceUID
            // for now, only use the suid;
            var suid = image.getSeriesInstanceUID();
            if (suid == undefined)
                suid = image.getSeriesNumber()

            if(suid !== null) 
            {    
                    
                // in strange cases, images can have same suid but different geometries... use some advanced other tags for key
                if(1)
                {
                    var sizehash = "";
                    sizehash += image.gettag("Rows") + "x" + image.gettag("Columns");
                    var x = image.gettag("ImageOrientationPatient");
        
                    if(x!=undefined)
                    {
                        for(var k=0; k<x.length; k++)
                        {
                            // some shitty brainlab CT dicoms can have quite some variability in ImageOrientationPatient, maybe after a coreg  ... 
                            // general problem with 0.0, -0.0 => add 1
                            sizehash += (x[k] + 1).toFixed(2) ;
                        }
                    }
                    suid += sizehash + image.gettag("SegmentLabel") + image.gettag("PatientID") ; //+ image.ktags.WindowCenter.value[0];
                }
        
                function done()
                {
                    series[suid].daikonseries.addImage(image);
                    fileobj.isdicom = true;
                    if (callback)
                        callback(true)
                    return true
                }
            
                if(series[suid] === undefined) // start a new series
                {
                    series[suid] = {};
                    series[suid].daikonseries = new daikon.Series();
                    series[suid].seriesDescription =  image.getSeriesDescription() || "noDescription";
                    series[suid].seriesNumber = image.getSeriesNumber() || "0";;
                    series[suid].AcquisitionNumber = image.gettag("AcquisitionNumber")
                    series[suid].PatientID = image.getPatientID() || "nopatientid";
                    series[suid].AccessionNumber = image.gettag("AccessionNumber")
                    series[suid].originalStudyID = image.gettag("StudyID");
                    series[suid].StudyDescription = image.gettag("StudyDescription");
    
                    series[suid].image0 = image;
                    
                    if (image.ktags.FrameOfReferenceTransformMatrix && image.ktags.ReferencedSOPInstanceUID)
                    {
    
                        for (var k = 0; k < image.ktags.ReferencedSOPInstanceUID.multival.length;k++)
                            that.transform_suidmap[image.ktags.ReferencedSOPInstanceUID.multival[k]] = image;
                    }
    
                    var studydate = image.getStudyDate() || "00000000";
    
                    if (studydate.length > 8)
                    {
                        studydate = studydate.substring(0,8);
                        studydate = studydate.replace(/[^0-9.]/g,'0')
                    }
    
                    var studytime = image.getStudyTime() || "";
                    
                    if(studytime==undefined)
                        studytime = studytime;
                    else
                        studytime = studytime.split('.')[0];
    
                    var studydatetime = (studydate +  studytime).toString();
    
                    series[suid].studydatetime = studydatetime;
                    series[suid].studydatetime_nosec = studydatetime.substring(0,12);
                    series[suid].StudyDate = studydate;
                    series[suid].StudyTime =  image.getStudyTime();
    
                    series[suid].PatientName = image.getPatientName() || "NoPatientName";
                    series[suid].PatientName = series[suid].PatientName.trim();
                    var names =  series[suid].PatientName.split(" ");
                    series[suid].GivenName = names[1];
                    series[suid].FamilyName = names[0];
                 
    
                    series[suid].ProtocolName = image.gettag("ProtocolName")
                    series[suid].ImageType = image.gettag("ImageType")
                    series[suid].Rows = image.gettag("Rows")
                    series[suid].Columns = image.gettag("Columns")
    		        series[suid].filepath = name; 
                    series[suid].seriesInstanceUID = suid;
                    series[suid].diffusion = false;
                    series[suid].bDirections = [];
                    series[suid].bMatrix = [];
                    series[suid].bValue = [];
                    series[suid].ImageOrientationPatient = image.gettag("ImageOrientationPatient");
                    series[suid].SeriesInstanceUID = image.getSeriesInstanceUID();
                    series[suid].StudyInstanceUID = image.gettag('StudyInstanceUID');
                    series[suid].imagePathList = [name];
    
                    // this is the default for the studyID
                    series[suid].StudyID = studydatetime;
    
    
                    if (typeof projectInfo == "object" && projectInfo.jsondesc)
                    {
                        if (projectInfo.jsondesc.StudyID_type != undefined && projectInfo.jsondesc.StudyID_type != "studydatetime")
                        {
                            var sid = image.gettag(projectInfo.jsondesc.StudyID_type);
                            if (sid == undefined)
                                sid = series[suid][projectInfo.jsondesc.StudyID_type]
                            if (sid != undefined)
                                series[suid].StudyID = sid;
                            else
                                console.warn("Custom StudyID type: '" + projectInfo.jsondesc.StudyID_type + "' not extisting in dicom header, falling back to default");
    
                        }
    
                        if (projectInfo.jsondesc.PatientID_type != undefined)                    
                        {
                            var piz;
                            if (projectInfo.jsondesc.PatientID_type == "suid")
                            {
                                pid_hashfun("sha",series[suid].StudyInstanceUID,function(d)
                                {                        
                                    piz = d.substring(0,16);
                                    image.ktags.PatientName.value[0] = piz;
                                });
                            }
                            else if (projectInfo.jsondesc.PatientID_type == "studydatetime")
                                piz = studydatetime;
                            else
                                piz = image.gettag(projectInfo.jsondesc.PatientID_type);
                                
                            if (piz != undefined)
                                series[suid].PatientID = piz;
                            else
                                console.warn("Custom PatientID type: '" + projectInfo.jsondesc.PatientID_type + "' not extisting in dicom header, falling back to default");
    
    
                            
                        }
    
                        // get rid of all non-alphanumerics in PIZ/SID
                        series[suid].PatientID = series[suid].PatientID.replace(/\W/g,'');
                        series[suid].StudyID = series[suid].StudyID.replace(/\W/g,'');
                        series[suid].PatientID = series[suid].PatientID.replace(/\_/g,'-');
                        series[suid].StudyID = series[suid].StudyID.replace(/\_/g,'-');
    
                        if (image.ktags.PatientID != null && image.ktags.PatientID.value != null)
                            image.ktags.PatientID.value[0] = series[suid].PatientID;
                        else
                            image.ktags.PatientID = {value:series[suid].PatientID }
                        if (image.ktags.StudyID != null && image.ktags.StudyID.value != null)
                            image.ktags.StudyID.value[0] = series[suid].StudyID;
                        else
                            image.ktags.StudyID = {value:series[suid].StudyID }
    
    
                        if (projectInfo.jsondesc.anonymization && typeof pid_hashfun != "undefined")
                        {
    
                            pid_hashfun(projectInfo.jsondesc.anonymization.type,series[suid].PatientID,function(ppid)
                            {
                                var keylength=10;
    
                                if (projectInfo.jsondesc.anonymization.key_length != undefined)
                                    keylength = projectInfo.jsondesc.anonymization.key_length
                                ppid = ppid.substring(0,keylength);
                                
                                series[suid].PatientID = ppid;
                                series[suid].PatientName =ppid;
                                series[suid].FamilyName = ppid.substring(0,10)
                                series[suid].GivenName = "anonym";
                                
                                if(image.ktags.PatientName.value != null)
                                {
                                    image.ktags.PatientName.value[0] = series[suid].FamilyName + " " + series[suid].GivenName
                                    image.ktags.PatientID.value[0] = series[suid].PatientID;
                                }
    
                                var fields = ["PatientBirthDate"];
                                if (projectInfo.jsondesc.anonymization && projectInfo.jsondesc.anonymization.fields_to_remove)
                                    fields = fields.concat(projectInfo.jsondesc.anonymization.fields_to_remove);
    
                                for (var k = 0;k < fields.length;k++)
                                {
                                    if (image.ktags[fields[k]] != undefined)
                                    {
                                        if (image.ktags[fields[k]].value != undefined)                                        
                                            image.ktags[fields[k]].value = [""];
                                    }
                                    if (series[suid][fields[k]] != undefined)
                                    {
                                        series[suid][fields[k]] = "";
                                    }
                                }
    
    
                                return done();
    
                            });
                        }
                        else
                           return  done();
                    }
                    else
                        return  done();
    
    
                }
                else
                {
                    //remember all original image paths for sorting purposes
                    series[suid].imagePathList.push( name );
                    return done()
                }
    
            }
            else
            {
               if (callback)
                    callback(false)            
    	       return false;
            }
        }
     }
        
    // helper function for a file reader, taken from somewhere
    function makeSlice(file, start, length) 
    {
        var fileType = (typeof File);
        if (fileType === 'undefined') {
            return function () {};
        }
        if (File.prototype.slice) {
            return file.slice(start, start + length);
        }
        if (File.prototype.mozSlice) {
            return file.mozSlice(start, length);
        }
        if (File.prototype.webkitSlice) {
            return file.webkitSlice(start, length);
        }
        return null;
    }
 
    that.readSingleDICOM = readSingleDICOM;
        
    function dicom2nii(whendone,finalcallback)
    {
            var suidList = Object.getOwnPropertyNames(series);
            var numItems = suidList.length;
            if (numItems == 0)
            {
                progress();
                whendone(undefined, error_report);
                if (finalcallback)
                    finalcallback();
                
                return;
            }
     

            // SPECIALITY: time series as multiple series, for example as in DCE vibe: must glue to one single series
            // find out what belongs together: check if a series with same num of images is there. if yes, make a time series.
            if( 1 )
            {
                var newlist = {};
                for(var k=0; k<suidList.length; k++ )
                {
                    // key will be number series desription + num of images + difference between seriesNumber + acquisitonNumber + ImageOrientationPatient
                    var ss = series[suidList[k]];
                    var mname = ss.daikonseries.images[0].gettag('ManufacturerModelName');
                    
                    if( (mname && mname.search(/^NAEOTOM/)==0) && (ss.ProtocolName && ss.ProtocolName.search(/^CTDI/)==0) )
                    {
//                         if( ity.filter(function(x){ return x.match(/IOD/) }).length > 0 )
                      var key = 'PCCT' + ss.seriesDescription +  ss.daikonseries.images.length + ss.ImageOrientationPatient + ss.Rows + ss.Columns;
                      var ity = ss.ImageType;
                      if(ity)
                      {
                            var a = 'VNC'
                            if(ity.filter(function(x){ return x.match('^'+a) }).length > 0)
                            {
                                key += a;
                                ss.seriesDescription +='_' + a;
                            }
                            var a = 'IMD'
                            if(ity.filter(function(x){ return x.match('^'+a) }).length > 0)
                            {
                                key += a;
                                ss.seriesDescription +='_' + a;
                            }
                      }
                    }
                    else if(ss.seriesDescription.search(/^GRASP/)==0 || ss.seriesDescription.search(/^Brain_0_5_CE/)==0 )
                        var key = 'GRASP' + ss.daikonseries.images.length + ( parseInt(ss.seriesNumber) - parseInt(ss.AcquisitionNumber) ) +ss.ImageOrientationPatient + ss.Rows + ss.Columns;
                    else if (ss.daikonseries.images[0].gettag('Modality')== 'SR'  | ss.daikonseries.images[0].fromRDA)
                        var key = ss.SeriesInstanceUID;
                    else if (ss.daikonseries.images[0].gettag('Modality')== 'CR' ) // never glue CRs
                        var key = ss.SeriesInstanceUID;
                    else if (ss.daikonseries.images[0].gettag('Modality')== 'XA' ) // never glue XA
                        var key = ss.SeriesInstanceUID;
//                     else if (ss.daikonseries.images[0].gettag('Modality')== 'CT' ) // temporary switch OFF
//                         var key = ss.SeriesInstanceUID;
                    else
                        var key = ss.seriesDescription + ss.daikonseries.images.length + ( parseInt(ss.seriesNumber) - parseInt(ss.AcquisitionNumber) ) +ss.ImageOrientationPatient + ss.Rows + ss.Columns;
               
                    key += ss.daikonseries.images[0].gettag('SegmentLabel')                    
               //     key += ss.daikonseries.images[0].gettag('WindowCenter')

                    

                    if(newlist[key] == undefined)
                        newlist[key] = ss;
                    else
                       newlist[key].daikonseries.images =  newlist[key].daikonseries.images.concat( ss.daikonseries.images );
                }
                var newlist2 = {};
                var newkeys = Object.getOwnPropertyNames(newlist);
                for(var k=0; k<newkeys.length; k++ )
                {
                    var temp = newlist[newkeys[k]];
                    newlist[temp.seriesInstanceUID] = temp;
                    delete newlist[newkeys[k]];
                }
                series = newlist;
                suidList = Object.getOwnPropertyNames(series);
            }

            /******************************* 
             run again over all series, might happen that 2 series will have same filename (for example different views in DX )
            *******************************/
            var fnlist = {};
            var bestSRIndex = [-1, 0];
            for(var k=0; k<suidList.length; k++ )
            {
                var temp = series[suidList[k]];
                var fnkey = temp.StudyInstanceUID + temp.seriesDescription + temp.ProtocolName + temp.seriesNumber;
                if( fnlist[fnkey] != undefined)
                {
                    if( fnlist[fnkey].length == 1 )
                        series[ fnlist[fnkey][0] ].seriesSuffix = ("_a00");
                    temp.seriesSuffix = ("_a0" + (fnlist[fnkey].length)) ;
                    
                    fnlist[fnkey].push(suidList[k]);
                }
                else
                {
                    fnlist[fnkey] = [suidList[k]];
                    temp.seriesSuffix = "";
                }

                // structured report (SR) speciality: we need to take the "best one" (verified and completed) or newest one
                var CompletionFlag = temp.daikonseries.images[0].gettag('CompletionFlag');
                var VerificationFlag = temp.daikonseries.images[0].gettag('VerificationFlag');
                if(CompletionFlag != undefined)
                {
                    var tstamp = temp.daikonseries.images[0].gettag('SeriesDate') + temp.daikonseries.images[0].gettag('SeriesTime') 
    
                    if(bestSRIndex[0] == -1 || tstamp > bestSRIndex[1])
                        bestSRIndex = [k, tstamp];
                }
            }
            if(bestSRIndex[0] > -1)
                series[suidList[bestSRIndex[0]]].isBestStructuredReport = 1;

            /******************************* 
            OverlayData: multiple solutions. For now, create a "burned-in" overlay
            *******************************/
            for(var k=0; k<suidList.length; k++ )
            {
                var temp = series[suidList[k]];
                if(ss.daikonseries.getName().search('Aspect Score') > -1)
                {
                    if(temp.daikonseries.images[0].ktags.OverlayData != undefined)
                    {
                        for(var z=0; z<temp.daikonseries.images.length; z++)
                        {
                            var timg = temp.daikonseries.images[z];
                            var buf1 = timg.ktags.OverlayData.value;
                            var buf2 = timg.getPixelData().value;
                            
                            var targetValue = (200 - timg.ktags.RescaleIntercept.value) / timg.ktags.RescaleSlope.value;
                            
                            // Loop through each byte of buf1 and extract each bit
                            let bitIndex = 0;
                            for (let byteIndex = 0; byteIndex < buf1.byteLength; byteIndex++) {
                                const byte = buf1.getUint8(byteIndex);  // Get byte from buf1
                            
                                // Loop through each bit of the byte
                                for (let bit = 0; bit < 8; bit++) {
                                    const bitValue = (byte >> bit) & 1;  // Shift and mask to get bit
                            
                                    if (bitValue === 1) {
                                        // Update the corresponding 16-bit value in buf2
                                        const buf2Index = bitIndex * 2;  // Each 16-bit value takes 2 bytes
                                        if (buf2Index < buf2.byteLength) {
                                            buf2.setUint16(buf2Index, targetValue, timg.littleEndian);  // Set the target value
                                        }
                                    }
                                    bitIndex++;
                                }
                            }
                        }
                    }
                }
            }        

            convertSeries();

            function convertSeries()
            {
                    if (progress)
                    {
                       if (suidList.length == numItems)
                          progress("Creating Images");
                       else
                          progress("Creating Images " + math.round(100*(1-suidList.length/numItems))+"%");
                    }

                    var item = series[suidList[0]];
                    suidList = suidList.slice(1);
                    

                    var mypapaya = undefined;
                    var myRT = undefined;
                    try 
                    {
                        if (item.daikonseries.buildSeries() != "noimage")
                        {
                            mypapaya =  new papaya.volume.dicom.HeaderDICOM();
                            mypapaya.series = item.daikonseries;
                            item.type = 'nii';
                        }
                        else if( item.image0.tags['00420011'] != undefined) // item.daikonseries.images[0].gettag('Modality') == "DOC")
                        {
                            item.buffer = item.image0.tags['00420011'].value.buffer;
                            item.type = 'pdf'
                        }
                        else if(item.daikonseries.images[0].gettag('Modality') == "RTSTRUCT")
                        {
                            // no nice implementation of RT struct (see also below)
                           item.buffer = prepareRTstruct(item);
                           item.type = 'rtstruct';
                        }

                    } 
                    catch(err) 
                    {
                        console.log(err);
                        if (suidList.length > 0)
                            convertSeries();
                        else
                        {
                            if (finalcallback)
                                finalcallback();
                            progress();
                        }
                        return;    
                    }
                    try 
                    {
                        if (mypapaya)  // if image data was found
                        {
                            mypapaya.readImageData(null, function (imageData) 
                            { 
                                // create the raw nii buffer
                                mypapaya.imageData = imageData;
                                mypapaya.fromRDA = item.image0.fromRDA
  
                                var extendedheader = undefined
                                var info = item.daikonseries.imageInfo;

                                
                                if (info.diffusion)
                                {
                                    if (info.bValue.length == 1 && info.bValue[0] == 0)
                                         ;
                                    else
                                    {
                                        var rot  = mypapaya.getBestTransform().rot;
                                        var bX = "";
                                        var bY = "";
                                        var bZ = "";
                                        var bV = "";
                                        var bM = "";
                                        var bmrtrix = "";
                                        for (var k = 0; k < info.bDirections.length;k++)
                                        {

                                            if (info.bMatrix[k] != undefined)
                                            {
                                                var d = info.bMatrix[k];
                                            
                                                bM += d[0][0]  + " " + d[0][1] + " " + d[0][2] + " " +
                                                      d[1][0] + " " + d[1][1] + " " + d[1][2] + " " +
                                                      d[2][0]  + " " + d[2][1] + " " + d[2][2] + " \n";
                                                var dir = math.maxEV(math.matrix(d))
                                                var v = dir.v._data
                                                bX += v[0].toFixed(3) + " ";
                                                bY += v[1].toFixed(3) + " ";
                                                bZ += v[2].toFixed(3) + " ";
                                                bV += dir.ev + " ";
                                            }
                                            else
                                            {
                                                var d = info.bDirections[k];
                                                
                                                d = [parseFloat(d[0]),parseFloat(d[1]),parseFloat(d[2])];
                                                bmrtrix+= (d[0].toFixed(3) + " " + d[1].toFixed(3) + " " + d[2].toFixed(3) + " " +  info.bValue[k].toFixed(3) + "\n");
    
                                                d = math.multiply(math.Transpose(math.matrix(rot)),math.matrix(d))._data;
                                                bX += d[0].toFixed(3) + " ";
                                                bY += d[1].toFixed(3) + " ";
                                                bZ += d[2].toFixed(3) + " ";
                                                bV += info.bValue[k] + " ";
    
                                                var d = info.bMatrix[k];
                                                var R = math.matrix(rot);
                                                if(d!=undefined && d.length > 0)
                                                {
                                                    d = math.multiply(math.multiply(math.Transpose(R),d),R)._data;
                                                    bM += d[0][0]  + " " + d[0][1] + " " + d[0][2] + " " +
                                                          d[1][0] + " " + d[1][1] + " " + d[1][2] + " " +
                                                          d[2][0]  + " " + d[2][1] + " " + d[2][2] + " \n";
                                                }
                                                else
                                                    bM += "0 0 0 0 0 0 0 0 0 \n";
                                            }

                                        }
                                        item.bval = bV;
                                        item.bvec = bX + "\n" + bY + "\n" + bZ + "\n";
                                        item.bmat = bM; 
                                        item.bmrtrix = bmrtrix; 
                                        item.diffusion = true;
                                        extendedheader = {bval:item.bval,bvec:item.bvec,bmat:item.bmat}
                                        console.log("diffusion info found");
                                    }
                                }

                                var nifti = getNiftiBuffer(mypapaya,extendedheader);  
                                item.buffer = nifti.buffer
                                item.edges = nifti.edges;


                                item.imageDimensions = mypapaya.getImageDimensions();

                                // is this a (perfusion, fmri) - timeseries?
                                // if yes, write the exact slice timing later as a .time file
                                if ( ( (item.ImageType && item.ImageType.indexOf('PRIMARY') > -1 && 
                                        (item.ImageType.indexOf('PERFUSION')> -1 || item.ImageType.indexOf('ECHO_00')> -1  ) )  
                                       | item.daikonseries.images[0].gettag('Modality') == 'CT'
                                       | item.seriesDescription.search('perf') != -1
                                       | item.seriesDescription.search('cmrr') != -1
                                     )
                                    &&  item.imageDimensions.timepoints > 5 )
                                    item.isTimeSeries = 1;
                                else
                                    item.isTimeSeries = 0;

                                // create a javascript nifti object
                                // item.nii =  parse( item.buffer   ) ;

                                if(whendone)
                                    whendone(item, error_report);

                                if (suidList.length > 0)
                                    convertSeries();
                                else
                                {
                                    if (finalcallback)
                                        finalcallback();
                                    progress();
                                }
                            });
                        }
                        else if(item.daikonseries.images[0].gettag('Modality') && item.daikonseries.images[0].gettag('ContentSequence') )
                        {
                            // structured report content (SR) ContentSequence
                            /*  
                            http://dicom.nema.org/dicom/2013/output/chtml/part05/sect_7.5.html

                            (0040,a730) SQ (Sequence with explicit length #=6)      # 2060, 1 ContentSequence
                              
                              (fffe,e000) na (Item with explicit length #=4)          # 152, 1 Item
                                (0040,a010) CS [HAS CONCEPT MOD]                        #  16, 1 RelationshipType
                                (0040,a040) CS [CODE]                                   #   4, 1 ValueType
                                (0040,a043) SQ (Sequence with explicit length #=1)      #  50, 1 ConceptNameCodeSequence
                                  (fffe,e000) na (Item with explicit length #=3)          #  42, 1 Item
                                    (0008,0100) SH [121049]                                 #   6, 1 CodeValue
                                    (0008,0102) SH [DCM]                                    #   4, 1 CodingSchemeDesignator
                                    (0008,0104) LO [Sprache]                                #   8, 1 CodeMeaning
                                  (fffe,e00d) na (ItemDelimitationItem for re-encoding)   #   0, 0 ItemDelimitationItem
                                (fffe,e0dd) na (SequenceDelimitationItem for re-encod.) #   0, 0 SequenceDelimitationItem
                                (0040,a168) SQ (Sequence with explicit length #=1)      #  50, 1 ConceptCodeSequence
                                  (fffe,e000) na (Item with explicit length #=3)          #  42, 1 Item
                                    (0008,0100) SH [de]                                     #   2, 1 CodeValue
                                    (0008,0102) SH [ISO639_2]                               #   8, 1 CodingSchemeDesignator
                                    (0008,0104) LO [Deutsch]                                #   8, 1 CodeMeaning
                                  (fffe,e00d) na (ItemDelimitationItem for re-encoding)   #   0, 0 ItemDelimitationItem
                                (fffe,e0dd) na (SequenceDelimitationItem for re-encod.) #   0, 0 SequenceDelimitationItem
                              (fffe,e00d) na (ItemDelimitationItem for re-encoding)   #   0, 0 ItemDelimitationItem
                              (fffe,e000) na (Item with explicit length #=4)          # 238, 1 Item
                                
                                ... next item


                              (fffe,e000) na (Item with explicit length #=5)          # 966, 1 Item
                                (0040,a010) CS [CONTAINS]                               #   8, 1 RelationshipType
                                (0040,a040) CS [CONTAINER]                              #  10, 1 ValueType
                                (0040,a043) SQ (Sequence with explicit length #=1)      #  48, 1 ConceptNameCodeSequence
                                  (fffe,e000) na (Item with explicit length #=3)          #  40, 1 Item
                                    (0008,0100) SH [121077]                                 #   6, 1 CodeValue
                                    (0008,0102) SH [DCM]                                    #   4, 1 CodingSchemeDesignator
                                    (0008,0104) LO [Befund]                                 #   6, 1 CodeMeaning
                                  (fffe,e00d) na (ItemDelimitationItem for re-encoding)   #   0, 0 ItemDelimitationItem
                                (fffe,e0dd) na (SequenceDelimitationItem for re-encod.) #   0, 0 SequenceDelimitationItem
                                (0040,a050) CS [SEPARATE]                               #   8, 1 ContinuityOfContent
                                (0040,a730) SQ (Sequence with explicit length #=1)      # 852, 1 ContentSequence
                                  (fffe,e000) na (Item with explicit length #=2)          # 844, 1 Item
                                    (0040,a040) CS [TEXT]                                   #   4, 1 ValueType
                                    (0040,a160) UT [Der Patient lehnt eine Kontrastmittel-Gabe ab.

                            */
                            
                            var srjson = 
                            {
                                StudyDate: item.daikonseries.images[0].gettag('StudyDate'),
                                StudyTime: item.daikonseries.images[0].gettag('StudyTime'),
                                SeriesDate: item.daikonseries.images[0].gettag('SeriesDate'),
                                SeriesTime: item.daikonseries.images[0].gettag('SeriesTime'),
                                PatientID: item.daikonseries.images[0].gettag('PatientID'),
                                PatientName: item.daikonseries.images[0].gettag('PatientName'),
                                AccessionNumber: item.daikonseries.images[0].gettag('AccessionNumber'),
                            };

                            srjson.CompletionFlag = item.daikonseries.images[0].gettag('CompletionFlag') && item.daikonseries.images[0].gettag('CompletionFlag') == "COMPLETE";
                            srjson.VerificationFlag = item.daikonseries.images[0].gettag('VerificationFlag') && item.daikonseries.images[0].gettag('VerificationFlag') == "VERIFIED";

                            var srhtml = "";
                            var srtxt = "";

                            var lastkey = "nokey";
                            
                            var isCONTAINER = false;

                            var verbose = 0;
                            
                            function parseItem(parent, item)
                            {
                                if(1)//item.id == "FFFEE000" && item.sublist)
                                {
                                    var temp = item.value; 
                                    for(var z=0; z<temp.length; z++)
                                    {
                                        //console.log("" + temp[z].id + " " + temp[z].vr + " " + temp[z].value )
                                        //console.log(" PARSING::: " + temp[z].id + " " + temp[z].vr + " "  )

                                       if( (temp[z].id == "0040A040" &&  temp[z].value[0] == "CONTAINER") ) // RelationshipType
                                       {
                                           isCONTAINER = true;
                                       }

//                                         else if( temp[z].id == "0040A040" ) // ValueType
                                        
                                        
                                        if(  temp[z].sublist ) // ContentSequence => type SQ
                                        {
                                            parseItem(item, temp[z])
                                        }
                                        if( temp[z].id == "00080104" && isCONTAINER ) // This seems to be a title, for example "Befund"
                                        {
                                            srhtml += "<h3>" + temp[z].value + "</h3>";
                                            srtxt += "\n" + temp[z].value + "\n================================";
                                            lastkey = temp[z].value;
                                            if(verbose)
                                                console.log("=============== " + temp[z].value  + " ===============")
                                        }
                                        // SRTextValue This is a content text we are looking for
                                        // go back in tree to find the correct id
                                        if( temp[z].id == "0040A160" && isCONTAINER ) 
                                        {
                                            srhtml += "<p>" + temp[z].value + "</p>";
                                            srtxt += "\n" + temp[z].value + "\n";
                                            
                                            srjson[lastkey] = temp[z].value[0]
                                            isCONTAINER = false;
                                            
                                            if(verbose)
                                                console.log("" + temp[z].value )
                                        }
                                    }
                                }
                            }

                            var root = item.daikonseries.images[0].gettag('ContentSequence');
                            // walk over all items
                            if(verbose)
                                console.log("//////////////  SR fields  //////////////////////");

                            if(1) // print completed / verified
                            {
                                srhtml += "<div>";    
                                if(srjson.CompletionFlag)
                                    srhtml += "<span class='sr_ok'>COMPLETED</span>";
                                else
                                    srhtml += "<span class='sr_not_ok'>NOT COMPLETED</span>";

                                if(srjson.VerificationFlag)
                                    srhtml += "<span class='sr_ok'>VERIFIED</span>";
                                else
                                    srhtml += "<span class='sr_not_ok'>NOT VERIFIED</span>";

                                srhtml += "</div>";    

                                //srhtml += "<div class='sr_info_patient'><span>Patient: "+  +" </span><div>";
                                srhtml += "<div class='sr_info_date'>StudyDate: "+srjson.StudyDate+", ReportDate:" +  srjson.SeriesDate + " </div>";
                            }

                            for(var k=0; k<root.length; k++)
                            {
                                // this is really a valid item (which again is a sublist)
                                parseItem(srjson, root[k])
                            }
                            
                            if(verbose)
                            {
                                console.log("" + srtxt);
                                console.log("==============================");
                                console.log(srjson);
                            }


                            // only save verified or completed reports?
                            // hm, sometimes there are only incomplete and unverified ones, then take these ... puh, complicated!
                            if( (srjson.VerificationFlag || srjson.CompletionFlag) || item.isBestStructuredReport )
                            {
                                item.isStructuredReport = true;
                                item.daikonseries.srjson = srjson;
                                item.daikonseries.srhtml = srhtml;
                                item.daikonseries.srtxt  = srtxt;
                            }


                            if(whendone)
                                whendone(item, error_report);
                            if (suidList.length > 0) // convert next item
                            {
                               convertSeries();
                            }
                            else
                            {
                                if (finalcallback)
                                    finalcallback();
                                progress();
                            }

                        } // end  of structured report if
                        else // other data (RT struct ?)
                        {
                             // RT struct is badly implemented with "noimage" check
                             // must distinguish between "noimage" and other Rt rtstruct
                             // switch of registration of "noPixelDataImages" for now
                             
                             
                             if(whendone)
                                    whendone(item, undefined);
                             

                            if (suidList.length > 0)
                            {
                               convertSeries();
                            }
                            else
                            {
                                if (finalcallback)
                                    finalcallback();
                                progress();
                            }
                        }

                    } 
                    catch(err) 
                    {
                        error_report.daikon = true;
                        console.log(err);
                        if(whendone)
                             whendone(item, error_report);
                        if (suidList.length > 0)
                            convertSeries();
                        else
                        {
                            if (finalcallback)
                                finalcallback();
                            progress();
                        }
                        return;        
                    }
                
            }

    }


    function getNiftiBuffer(mypapaya,extendedheader)
    {

        // this is a default nifti buffer in uint8 representation.
        var niihdr = [92,1,0,0,117,105,110,116,49,54,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,114,0,1,0,16,0,16,0,1,0,1,0,1,0,1,0,1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,4,0,16,0,0,0,0,0,128,191,0,0,128,63,0,0,128,63,0,0,128,63,0,0,128,63,0,0,128,63,0,0,128,63,0,0,128,63,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,110,111,110,101,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1,0,1,0,0,0,0,0,0,0,0,0,0,0,128,63,0,0,0,0,0,0,0,0,0,0,0,0,0,0,128,191,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,128,191,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,128,63,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,110,105,49,0,0,0,0,0];  
        //var buffer = Uint8Array.from(niihdr).buffer;
        var buffer = (new Uint8Array(niihdr)).buffer;

        var sx,sy,sz,st,st2, vx,vy,vz, edges, datatype; 
        var littleEndian = true;

        // assume uint16 as default           
        var datatype = 512;       


        var imgSize = mypapaya.getImageDimensions();
        var voxSize = mypapaya.getVoxelDimensions();

        sx =  imgSize.cols;
        sy =  imgSize.rows;
        sz =  imgSize.slices;
        st =  imgSize.timepoints;
        st2 =  1;

        // some images have one slice, multiple "timepoints", for example XA, or US, or some RGBs. convert to pseudo-3D volume
        // no good idea, cannot perform measurements etc then?
//        if(sz==1 && st > 1 && mypapaya.series.images[0].getDataType() == 6 || mypapaya.series.images[0].gettag("Modality").value == "XA")
        // only do for RGB series
        if(sz==1 && st > 1 && mypapaya.series.images[0].getDataType() == 6) 
        {
            sz = st;
            st = 1;
        }
        
        vx =  voxSize.colSize;
        vy =  voxSize.rowSize;
        vz =  voxSize.sliceSize;


        if (mypapaya.fromRDA)
        {
            datatype = 64;
            st =  imgSize.timepoints/2;
            st2 = 2;
        }
/*
        if (mypapaya.series.images[0].ktags.ImageComments.value[0] == "phase difference images")
        {
            st2 = 3;
            st = imgSize.timepoints/3;
        }
*/
        edges = mypapaya.getBestTransform().edges;
        // permutationOrder gives the order in which the real world is stored in the array

        if (edges == undefined | edges == null)
        {
            // DICOM default is LPS, in nifti we have RAS, so -1 -1  1  shall be nifti default
            edges =  math.diag([-1, -1, 1, 1]);;
        }


    //  this was just a test try forget it.
    //  var A = edges.slice(0,3);
    //  var permutationOrder = [findIndexOfGreatest(A[0].slice(0,3)), findIndexOfGreatest(A[1].slice(0,3)), findIndexOfGreatest(A[2].slice(0,3) )];

    //  permutationOrder  = [1,2,0];

        // adapt the offsets
    //  var offs = [0, 0, 0, 0];
    //  // slice axis up side down
    //  var sliceAdd =  -(sz-1) * vz;
    //  var sliceIndex = permutationOrder[2];
    //  // y axis exchange
    //  var yAdd =  -(sy-1) * vy;
    //  var yIndex = permutationOrder[1];

    //  edges[sliceIndex][3] =  edges[sliceIndex][3] +  sliceAdd;
    //  edges[yIndex][3]     =  edges[yIndex][3] +  yAdd;
        //console.log(edges[2]);

                     // linearize     


  // set the  header to nifti header
       var view = new DataView(buffer);


       var signum_edges = Math.sign(math.det(edges._data));

       var qquat = sform2quaternion(edges);

       view.setFloat32(256, qquat.q[0], littleEndian);
       view.setFloat32(260, qquat.q[1], littleEndian);
       view.setFloat32(264, qquat.q[2], littleEndian);
       view.setFloat32(268, edges._data[0][3], littleEndian);
       view.setFloat32(272, edges._data[1][3], littleEndian);
       view.setFloat32(276, edges._data[2][3], littleEndian);

       var edges_ = edges;
                        
       edges = edges._data;

       // nifti standard is row-wise storage, edges already come in this from from daikon.js
       edges = edges[0].concat(edges[1]).concat(edges[2]).concat(edges[3]);

       var ndims = st>1?4:3;
       ndims = st2>1?5:ndims;

      
       // sizes
       view.setInt32(0, 348,  littleEndian )
       view.setInt16(40, ndims,  littleEndian )
       view.setInt16(42, sx,  littleEndian )
       view.setInt16(44, sy,  littleEndian )
       view.setInt16(46, sz,  littleEndian )
       view.setInt16(48, st,  littleEndian )
       view.setInt16(50, st2,  littleEndian )

       // edges
       var srow = new Float32Array(12);
       for(var i=0; i<12; i++) 
            srow[i] = view.setFloat32(280+4*i, (edges[i]), littleEndian)




 



       // ====== apply some other important stuff
       // set the magic number to n+1
       view.setInt32(344, 1848324352,  !littleEndian )
       // set vox offset to 352
       view.setFloat32(108, 352, littleEndian) 


       // pixdims
       view.setFloat32(76, signum_edges,  littleEndian ) // this is the qfac. Only set, if qform is provided??
       view.setFloat32(80, vx,  littleEndian )
       view.setFloat32(84, vy,  littleEndian )
       view.setFloat32(88, vz,  littleEndian )

       // qform=0, 
       view.setInt16(252, 0,  littleEndian )

       var dcm = mypapaya.series.images[0];

       // window
        // E. Kellner
        // in some DICOMS, this is ugly set. So do not use this feature.
        if(1)
        {
            var w = mypapaya.series.images[0].ktags['WindowWidth'];
            var c = mypapaya.series.images[0].ktags['WindowCenter'];
            if(c !=undefined && w != undefined)
            {
                c = c.value;
                w = w.value;
                if(Array.isArray(c)){ c=c[0]; w=w[0];}
                var cal_max = c+w/2;
                var cal_min = c-w/2;
                view.setFloat32(124, cal_max, littleEndian)
                view.setFloat32(128, cal_min, littleEndian)
            }
        }

        // Slice Timing 
        var sliceDuration =  mypapaya.series.sliceDuration ;
        if ( sliceDuration != undefined   && !isNaN( sliceDuration ) )
             view.setFloat32(132, sliceDuration, littleEndian)


       // date type and conversion of little / big endian (if required)
       var dcmdatatype  = dcm.getDataType();
       var dcmnumBytes  = dcm.getBitsAllocated() / 8;
       var dcmendianess = dcm.littleEndian;
       if(dcmnumBytes > 1 && dcmendianess != littleEndian) // endianess conversion required 
       {    
            var dataView = new DataView( mypapaya.imageData );
            var mask = daikon.Utils.createBitMask(dcm.getBitsAllocated() / 8, dcm.getBitsStored(), dcmdatatype === daikon.Image.BYTE_TYPE_INTEGER_UNSIGNED);
            for (var ctr = 0; ctr < mypapaya.imageData.byteLength; ctr += dcmnumBytes) 
            {
                if( dcmdatatype == 4  ) // float
                {
                    var rawValue = dataView.getFloat32(ctr , dcmendianess);
                    dataView.setFloat32(ctr, (rawValue & mask), littleEndian);
                }
                else if( dcmdatatype == 2  ) // INT 
                {
                    var rawValue = dataView.getInt16(ctr , dcmendianess);
                    dataView.setInt16(ctr, (rawValue & mask), littleEndian);
                }
                else // ( dcmdatatype == 3 ) // UINT or other
                {
                    var rawValue = dataView.getUint16(ctr , dcmendianess);
                    dataView.setUint16(ctr, (rawValue & mask), littleEndian);
                }
            }
   
       }
       /* dicom data types
                daikon.Image.BYTE_TYPE_INTEGER = 2;
                daikon.Image.BYTE_TYPE_INTEGER_UNSIGNED = 3;
                daikon.Image.BYTE_TYPE_FLOAT = 4;
                daikon.Image.BYTE_TYPE_COMPLEX = 5;
                daikon.Image.BYTE_TYPE_RGB = 6;

          nifti data types
                    #define NIFTI_TYPE_UINT8           2 /! unsigned char. /
                    #define NIFTI_TYPE_INT16           4 /! signed short. /
                    #define NIFTI_TYPE_INT32           8 /! signed int. /
                    #define NIFTI_TYPE_FLOAT32        16 /! 32 bit float. /
                    #define NIFTI_TYPE_COMPLEX64      32 /! 64 bit complex = 2 32 bit floats. /
                    #define NIFTI_TYPE_FLOAT64        64 /! 64 bit float = double. /
                    #define NIFTI_TYPE_RGB24         128 /! 3 8 bit bytes. /
                    #define NIFTI_TYPE_INT8          256 /! signed char. /
                    #define NIFTI_TYPE_UINT16        512 /! unsigned short. /
                    #define NIFTI_TYPE_UINT32        768 /! unsigned int. /
                    #define NIFTI_TYPE_INT64        1024 /! signed long long. /
                    #define NIFTI_TYPE_UINT64       1280 /! unsigned long long. /
                    #define NIFTI_TYPE_FLOAT128     1536 /! 128 bit float = long double. /
                    #define NIFTI_TYPE_COMPLEX128   1792 /! 128 bit complex = 2 64 bit floats. /
                    #define NIFTI_TYPE_COMPLEX256   2048 /! 256 bit complex = 2 128 bit floats /
      */

       // not all datatypes are implemented yet
       if(     dcmdatatype == 3 & dcmnumBytes <= 1)   // uint8
            datatype = 2;
       else if(dcmdatatype == 3 & dcmnumBytes == 2)   // uint16
            datatype = 512;
       else if(dcmdatatype == 2 & dcmnumBytes == 1)   // int8 
            datatype = 256;
       else if(dcmdatatype == 2 & dcmnumBytes == 2)   // int16
            datatype = 4;
       else if(dcmdatatype == 4 )   // float32
            datatype = 16;
       else if(dcmdatatype == 6 )   // rgb24
            datatype = 128;



       // ********************** data (re)-scaling ************************************
       var hh        = mypapaya.series.images[0];
       if(mypapaya.series.isMultiFrame)
       {
           var slope     = hh.gettag("RealWorldValueSlope")!=undefined?hh.gettag("RealWorldValueSlope"):1;
           var intercept     = hh.gettag("RealWorldValueIntercept")!=undefined?hh.gettag("RealWorldValueIntercept"):0;
       }
       else
       {
           var slope     = hh.getDataScaleSlope() || 1;
           var intercept = hh.getDataScaleIntercept() || 0;
       }

        // data scaling. Might be different for each slice (for example PET)! In this case, must scale data in place and convert to float.
        // for now, do it only for PET (migh also be necessary for other modalities)
        // could also be implemented more efficiently in daikon in the loops, but then we must modify many dicom tags ...?
        if(hh.gettag("Modality") == "PT")
        {
            var mustrescale = false;
            for(var k=1; k<mypapaya.series.images.length; k++)
            {
                if(mypapaya.series.images[k-1].getDataScaleSlope() != mypapaya.series.images[k].getDataScaleSlope() || mypapaya.series.images[k-1].getDataScaleIntercept() != mypapaya.series.images[k].getDataScaleIntercept())
                {
                    mustrescale = true;
                    break
                 }
            }
            if(mustrescale)
            {

                var numsamples = sx*sy*sz*st;
                var samplesperslice = sx*sy;

                var newbuffer = new Float32Array(numsamples)


                var dataView = new DataView( mypapaya.imageData );
                for (var k = 0; k < sz; k+=1) 
                {
                    var slope = mypapaya.series.images[k].getDataScaleSlope();
                    var inter = mypapaya.series.images[k].getDataScaleIntercept();

                    for(var z=0; z<samplesperslice; z++)
                    {
                        var kk = (k*samplesperslice+z);
                        if( datatype == 2 || datatype == 512 ) // uint 8/16
                        {
                            newbuffer[kk]= dataView.getUint16(kk*dcmnumBytes , littleEndian)*slope+inter;
                        }
                        else if(datatype == 256 || datatype == 4 ) // int 8/16
                        {
                            newbuffer[kk]= dataView.getInt16(kk*dcmnumBytes , littleEndian)*slope+inter;
                        }
                        else if( dcmdatatype == 4  ) // float
                        {
                            newbuffer[kk]= dataView.getFloat32(kk*dcmnumBytes , littleEndian)*slope+inter;
                        }
                    }
                }

                mypapaya.imageData = newbuffer.buffer;
                datatype = 16;
                slope = 1;
                intercept = 0;
            }

            // SUVbw units
            if(hh.gettag('Units') == "BQML" | hh.gettag('Units') == "GML" )
            {
                if(hh.gettag('PatientWeight')) 
                {
                    // RadionuclideTotalDose in subgroup, take from tagsflat
                    if(hh.tagsFlat["00181074"] && hh.tagsFlat["00181074"].value )
                    {
                        var rad_total_dose = parseInt(hh.tagsFlat["00181074"].value)
                        var weight = parseFloat(hh.gettag('PatientWeight'));
                        var dose = rad_total_dose;
                        try {
                            dose = NaN;
                            var ti = (t) => t.substring(0,2)*3600 + t.substring(2,4)*60 + t.substring(4,6)*1;
                            var series_time = ti(hh.gettag('SeriesTime'))
                            var rad_time = ti(hh.tagsFlat['00181072'].value[0])
                            var decay_time_sec = series_time-rad_time;
                            var half_life = parseInt(hh.tagsFlat["00181075"].value)
                            dose = rad_total_dose * Math.pow(2,(-decay_time_sec/half_life))
                            console.log('PET dose correction factor: ' + (dose/rad_total_dose))
                        }
                        catch (err)  {  }

                        if (isNaN(dose))
                            dose = rad_total_dose;

                        // formula for SUVbw
                        var fac = weight*1000 / dose;
                        //console.log(fac)
                        slope*=fac;
                    }

                }

            }

                
        }


        view.setFloat32(112, slope,  littleEndian )
        view.setFloat32(116, intercept,  littleEndian )
       
        view.setInt16(70, datatype, littleEndian) 

        var byteImgData = mypapaya.imageData

        if (dcmdatatype == 3 & dcmnumBytes < 1) // binary bitwise // dicomseg? -> convert to uint8 nifti
        {
            var tmp = new Uint8Array(byteImgData)
            byteImgData = new Uint8Array(tmp.byteLength*8);
            for (var k = 0; k < tmp.byteLength;k++)
                for (var j = 0; j < 8;j++)
                    byteImgData[k*8+j] = ((1 << j) & tmp[k])>0; 
            
        }
        
       if (extendedheader)
       {    
             var content = JSON.stringify(extendedheader) + "         ";
             var rem = content.length%8;
             for (var k = 0; k < rem;k++)
                content += " ";
             var extbuf 
             if (typeof TextEncoder == "function")
             {
                 var utf8encoder = new TextEncoder()
                 extbuf = utf8encoder.encode(content);
             }
             else 
                 extbuf = Buffer.from(content, 'utf-8');
             var len = extbuf.byteLength;
             var vox_offset = 352+len;
             view.setFloat32(108,vox_offset,littleEndian) 

             var tmp = new Uint8Array(352 + len+  byteImgData.byteLength);
             tmp.set(new Uint8Array(buffer), 0);
             tmp.set(new Uint8Array(extbuf), 360);
             tmp.set(new Uint8Array(byteImgData),len+buffer.byteLength);
             
             var view_ = new DataView(tmp.buffer);
             view_.setInt32(348,1,littleEndian) 
             view_.setInt32(352,len,littleEndian) 
             view_.setInt32(352+4,0,littleEndian) 

       }
       else
       {


           // combine the header and the imageData
           console.log("allocating buffer of size " + ((buffer.byteLength + byteImgData.byteLength)/2**20).toFixed(2) + "M shape:[" + sx + "," + sy + ","+ sz + ","+ st + ","+ st2 + "]" )
           var tmp = new Uint8Array(buffer.byteLength + byteImgData.byteLength);
           tmp.set(new Uint8Array(buffer), 0);
           tmp.set(new Uint8Array(byteImgData), buffer.byteLength);
       }
       return {buffer:tmp , edges:edges_};
    }


    // function called  from the file manager
    that.loadDicoms = function (params, callback)
    {
        // callback if a series was found. Build the nifti and send to callback
        function whendone(tseries, error_report)
        {
            if(error_report !=undefined )
            {
                if(error_report.daikon !=undefined )
                {
                    alertify.error("Error when reading one or more DICOM files.")
                }
            }

            if (tseries == undefined)
            {
                callback([]); 
                return;
            }
            params

            var fobj = {};
		    fobj.URLType  = 'localfile';
            
            var fpattern;
            if (typeof projectInfo != "undefined" && projectInfo.jsondesc)
                fpattern = projectInfo.jsondesc.filename_creation_pattern;
            if (fpattern == undefined)
                 fpattern = "/<ProtocolName>/<Modifier>s<seriesNumber><seriesSuffix>";

            if (fpattern.substring(fpattern.length-3) == "nii")
                fpattern = fpattern.substring(0,fpattern.length-4)

            var outfi = that.mapFilePatternToName(fpattern, tseries)

            /* replace evil characters in filename  \W is alphanumeric + underscore 
               maybe this should be done on the filename only, to keep the true description?? 
               or maybe do it in on php move_uploaded_file?
               */ 
            tseries.seriesDescription = tseries.seriesDescription.replace(/\W/gi, ""); 
            tseries.ProtocolName      = tseries.ProtocolName.replace(/\W/gi, ""); 
            var type = tseries.type || "nii";

            var paths = outfi.substring(1).split("/");

            fobj.filename = paths[paths.length-1] + "." +  type;
            if (paths.length > 1)
                 fobj.SubFolder = paths.splice(0,paths.length-1).join("/");

            var fileinfo = {};
            tseries.PatientID = tseries.PatientID || "noPatientID";
	
	           
            fileinfo.patients_id = tseries.PatientID.replace(/[^a-zA-Z0-9]/g,"");
            fileinfo.studies_id = "#"+tseries.StudyID.replace(/[^a-zA-Z0-9]/g,"");
            var names = tseries.PatientName.split(" ")
            fileinfo.FamilyName = names[0];
            fileinfo.GivenName = names[1];
            fileinfo.Sex = "N";
            fileinfo.SeriesDescription = tseries.seriesDescription;
            
     
            fobj.fileinfo = fileinfo;
            fobj.fileID = 'localfile_' + tseries.seriesInstanceUID ;
            fobj.buffer = tseries.buffer;

            var flist = [fobj];

            function addonInfo(content,ext)
            {
                var fobj_add = $.extend({},fobj);
                fobj_add.filename = fobj_add.filename.replace(".nii","." + ext)
                fobj_add.buffer =content;
                fobj_add.fileID += "_" + ext ;
                flist.push(fobj_add);

            }


            if (tseries.diffusion)
            {
                addonInfo(tseries.bvec,"bvec");
                addonInfo(tseries.bval,"bval");

            }

            if (typeof projectInfo != "undefined" && projectInfo.jsondesc && projectInfo.jsondesc.writeFilespec && projectInfo.dictionary)
            {
                  var bidsinfo = that.mapBidsInfo(tseries);                
                  addonInfo(JSON.stringify(bidsinfo),'json');
            }


            if (callback)                 
                callback(flist); 
            
            if(dicomFileList[0] != undefined )
                dicomFileList[0].progressSpinner();
            



            
         } 

        if (params.length ==0)
        {
            callback([]);
            return false;
        }
            
        if (params[0].progressSpinner)
            params[0].progressSpinner('Checking dicom files ...');

        dicomFileList = that.checkForDicomData(params);
        if(dicomFileList.length == 0)
        {
            if (params[0].progressSpinner)
                params[0].progressSpinner();
            callback([]);
            return;
        }

        var abort = undefined;
        dicomFileList[0].progressSpinner('Converting dicoms ...', function ()
                                         {
                                             if (abort != undefined)
                                                 abort();
                                             params.to_be_aborted=true;
                                         });
        abort = readMultiFiles(dicomFileList, whendone,dicomFileList[0].progressSpinner );
    }



    // simply filter dicom extensions from file param list and return the file entries
    that.checkForDicomData =  function(params) 
    {

            var dicomList = [];
			var exts = ['dcm','DCM','ima','IMA',"rda"];	
            for(var k=0;k<params.length;k++)
            {
                if(params[k].filename)
                {            
                    for(var j=0;j<exts.length;j++)
                    {
                        if(params[k].filename.search("\\." + exts[j] ) > -1 ||  params[k].filename.search(/\./) == -1 )  // allow also dicoms with no extension! 
                        {
                             dicomList.push( params[k] );
                             break;
                        }
                    }
                }
            }
            return dicomList;
    }
   







    that.mapBidsInfo = function(item)
    {

          var res = {}
          try{
            var img = item.daikonseries.images[0]
          }
          catch(err)
          {
              return  {msg:"no valid header"};
          }

          function mapit(s)
          {         
              for (var k in s)
              {
                  res[k] = img.gettag(s[k]);             
                  if (res[k] == undefined)
                  {
                    var r = img.tags[s[k]];
                    if (r != undefined)
                      r = r.value;
                    if (r != undefined && r.length > 0)
                      res[k] = r[0]
                  }
              }
          }

          var dictionary = projectInfo.dictionary;
          if (dictionary == undefined)
            return {msg:"no info"};

          var imageAttributes = dictionary.imageAttributes;

          var t = that.map2BIDS(item);


          mapit(imageAttributes.common);
          if (t.modality != undefined)
            mapit(imageAttributes[t.modality]);


          return res;

    }

    that.map2BIDS =function(item)
    {

          var dictionary = projectInfo.dictionary;
          if (dictionary == undefined)
            return {folder:"dictFolderUNDEFINED",modality:"dictModalityUNDEFINED"}

              var keys = Object.keys(dictionary.series_map);

                  var found = undefined;
                  for (var k = 0; k < keys.length;k++)
                  {
                      if (dictionary.series_map[keys[k]] == "true")
                      {
                         return {folder:"misc",modality:item.ProtocolName} 
                      }
                      else                  
                      {

                        var mods = Object.keys(dictionary.series_map[keys[k]]);
                        for (var l = 0; l < mods.length;l++)
                        {

                          var tags = Object.keys(dictionary.series_map[keys[k]][mods[l]]);
                          var tagsX = [];
                          for (var s = 0; s < tags.length;s++)
                          {
                              if (tags[s] == 'seriesDescription')
                                  tagsX[s] = 'seriesDescription_original';
                              else
                                  tagsX[s] = tags[s];
                          }

                          if (keys[k] == "dti" && item.diffusion != false)
                             found = true;
                          else
                          {
                            for (var j = 0; j < tags.length;j++)
                            { 
                                if (item[tagsX[j]])
                                {
                                    var pats = dictionary.series_map[keys[k]][mods[l]][tags[j]];
                                    for (var i = 0; i < pats.length;i++)
                                    {
                                       if (item[tagsX[j]].search(pats[i]) > -1)
                                       {
                                          found = true;
                                          break;
                                       }
                                    }
                                    if (found)
                                      break
                                }
                            }
                          }
                          if (found)
                            break

                        }
                      }
                      if (found != undefined)
                      {
                        return {folder:keys[k],modality:mods[l]};
                      }
                  }
        return {folder:"bids_folder_undefined",modality:"bids_modality"}

      }


    that.mapFilePatternToName = function(fileName_pattern, item,outpath)
    {

               if (fileName_pattern == 'FILENAME')
               {
                  var fname = path.basename(item.filepath)       ;
                  fname = fname.replace("\.dcm","");
                  fname = fname.replace("\.DCM","");
                  fname = fname.replace("\.ima","");
                  fname = fname.replace("\.IMA","");
                  fname =  fname.replace(/\./g,"");
                  outfile = fullfile([outpath,fname+".nii"]);
                  console.log('srcfilename used:' + outfile);
               }    
               else
               {
                   // generate filename

                  item['seriesDescription'] = item['seriesDescription'].replace(/[^\w\-]/gi, "_")
                  item['ProtocolName']      = item['ProtocolName'].replace(/[^\w\-]/gi, "_")   
                  item['seriesDescription'] = item['seriesDescription'].replace(/[\_]+/g, "_")
                  item['ProtocolName'] = item['ProtocolName'].replace(/[\_]+/g, "_")                   
                  item['Modifier'] = item['seriesDescription'].replace(item['ProtocolName'],'');
                  item['seriesDescription_original'] = item['seriesDescription'];
                  item['seriesDescription'] =  item['seriesDescription'].replace(item['Modifier'],'');

                   if (item['Modifier'][0] == '_') 
                      item['Modifier'] = item['Modifier'].substring(1);
                  if (item['Modifier'] != "")
                     item['Modifier'] = item['Modifier'] + "_";

                  try {
                      if (item.daikonseries.images[0].tags['00620002'])
                      {
                          if (item.daikonseries.images[0].ktags.PointCoordinatesData)
                          {
                              item['Modifier'] = item.daikonseries.images[0].tags['00620002'].value[0].value[3].value 
                              item['ProtocolName'] = "TCK"                  
                          }
                          else
                          {
                              item['Modifier'] = item.daikonseries.images[0].tags['00620002'].value[0].value[3].value  + "_mask_"
                              item['ProtocolName'] = "SEG"                  
                          }
                      }}
                  catch(err) {}


                  if (item['seriesNumber'])
                  {
                      var tlen = Math.max(item['seriesNumber'].toString().length, 3);
                      item['seriesNumber'] =  ("00000" + item['seriesNumber']).slice(-tlen);
                  }

                  if (item['seriesSuffix'])
                    item['seriesNumber'] +=  item['seriesSuffix'];

                  var matches = fileName_pattern.match(/\<\w+\>/g);
                  var fname = fileName_pattern;
                  if (matches != undefined)
                      for (var j = 0; j < matches.length; j++)
                      {
                         var key = matches[j].substr(1,matches[j].length-2);
                         if (key == "DICTfolder")
                         {
                             fname = fname.replace(matches[j],that.map2BIDS(item).folder) ;
                         }
                         else if (key == "DICTmodality")
                         {
                             fname = fname.replace(matches[j],that.map2BIDS(item).modality) ;
                         }
                         else if (item[key] == undefined)
                         {
                              console.warn(key + " is undefined for " + item.filepath );
                              fname = fname.replace(matches[j],'undefined');
                         }
                         else
                              fname = fname.replace(matches[j],item[key]);
                      }

                  if (outpath != undefined)
                        outfile =  fullfile([outpath,fname]);
                  else
                        outfile = fname
                
                  outfile =  outfile.replace(/\ /g,"_");

              }
              return outfile;
    }






    that.dicom2nii = dicom2nii;
    return that;

}


//  static function pre - check for dicom files in a dropped List / folder.
// DicomReader.checkForDicomData = function (params) 
// {

//             var dicomList = [];
//             for(var k=0;k<params.length;k++)
//             {
//                 if(params[k].filename)
//                 {
//                     if(params[k].filename.search(".dcm") > -1) // 
//                          dicomList.push( params[k].file );
//                 }
//             }

//             if(dicomList.length > 0)
//                 return  dicomList;
//             else
//                 return ; // 
// }



function roughSizeOfObject( object ) {

    var objectList = [];

    var recurse = function( value )
    {
        var bytes = 0;

        if ( typeof value === 'boolean' ) {
            bytes = 4;
        }
        else if ( typeof value === 'string' ) {
            bytes = value.length * 2;
        }
        else if ( typeof value === 'number' ) {
            bytes = 8;
        }
        else if
        (
            typeof value === 'object'
            && objectList.indexOf( value ) === -1
        )
        {
            objectList[ objectList.length ] = value;

            for( i in value ) {
                bytes+= 8; // an assumed existence overhead
                bytes+= recurse( value[i] )
            }
        }

        return bytes;
    }

    return recurse( object );
}


function dicomParseReport(tag)
{
    /*    
    codepieces to parse to content of a dicom REPORT (SR) file
    from AGFA IMPAX dicom images


    "0040" : // Report
    {                  
        "A730" : ["SQ", "REPORT"],
    },



     dumpTag(image.ktags['REPORT']);

    */



    var html = "";

    if(Array.isArray(tag.value))
    {
        for(var k=0;k<tag.value.length; k++)
        {
            dumpTag(tag.value[k]);
        }
    }
    else
    {
        var tagstring = (daikon.Utils.dec2hex(tag.group))+','+ (daikon.Utils.dec2hex(tag.element));
        var val =  arrayBufferToString(tag.value.buffer);

        // 0040,0043 and value contains AGFA4ISOFT --> sectionTitle
        // 0040,A050 --> separator
        // 0040,A160 --> text

        if(tagstring == '0040,0042') // title
        {
            var str = val.split('AGFA4ISOFT');
            html += "<hr>";
            html += "<div class=''>" + str[1] + "</div>";
        }
        if(tagstring == '0040,A050') // sep
        {
            
        }
        if(tagstring == '0040,A160') // content
        {
            html += "<div class=''>" + val + "</div>";
            
        }
    }

    function arrayBufferToString(buffer)
    {
        var arr = new Uint8Array(buffer);
        var str = String.fromCharCode.apply(String, arr);
        return str;
    }


    console.log(html);
    return html;

}


function treeifyTagStruct(tag)
{

    if (tag.value != undefined)
    {
        if (Array.isArray(tag.value))
        {
            if (tag.value.length == 0 )
                return 
            if (tag.value[0].key == undefined)
            {
                if (tag.value.length == 1)
                    return tag.value[0]
                else
                    return tag.value;
            }
            else
            {
                var tree = {};
                for (var k = 0; k < tag.value.length;k++)
                {
                    if (tag.value[k].key !=undefined)
                    {
                        var key;
                        if (tag.value[k].key == "PrivateData")
                            key = tag.value[k].id;
                        else
                            key = tag.value[k].key;
                        var val = treeifyTagStruct(tag.value[k]);
                        if (tree[key] == undefined)
                            tree[key] = val;
                        else
                        {
                            var sup = tree[key];
                            if (Array.isArray(sup))
                                sup.push(val);
                            else
                            {
                                var arr = [];
                                arr[0] = sup;
                                arr[1] = val;
                                tree[key] = arr;
                            }

                        }
                    }
                    else
                        return tag.value[k];
                }
                return tree;
            }
        }
        else
            return treeifyTagStruct(tag.value);
            
    }
    else 
        return tag;
    
}


function prepareRTstruct(item)
{

    var x = [];
    for (var k = 0 ; k < item.daikonseries.images.length; k++)
    {
        try {
            var rt =treeifyTagStruct(item.daikonseries.images[k].ktags.ROIContourSequence).node
            var names = item.daikonseries.images[k].ktags.ROIName
            for (var j = 0; j < rt.length; j++)
            {
                rt[j].name = names.multival[j][0]
            }

            x = x.concat(rt);
        }
        catch (err) {
            err;

        }
    }
   


    var bbox_min_glob = [Infinity,Infinity,Infinity];
    var bbox_max_glob = [-Infinity,-Infinity,-Infinity];

    for (var k = 0; k < x.length; k++)
    {
       var c = x[k].ContourSequence.node;
       var bbox_min = [Infinity,Infinity,Infinity];
       var bbox_max = [-Infinity,-Infinity,-Infinity];
       for (var j = 0; j < c.length; j++)
       {
           var l = c[j].ContourData;
           var len = l.length/3;
           for (var i = 0;i < len;i++)
           {
               // change world coordinates (!!)
               l[3*i+0] = -l[3*i+0];
               l[3*i+1] = -l[3*i+1];
               for (var r = 0; r < 3;r++)
               {
                  bbox_min[r] = Math.min(l[3*i+r],bbox_min[r]);
                  bbox_max[r] = Math.max(l[3*i+r],bbox_max[r]);
               }
           }

       }
       x[k].bbox_min  = bbox_min;
       x[k].bbox_max  = bbox_max;

       for (var r = 0; r < 3;r++)
       {
          bbox_min_glob[r] = Math.min( bbox_min_glob[r],bbox_min[r]);
          bbox_max_glob[r] = Math.max( bbox_max_glob[r],bbox_max[r]);
       }

    }

    x.min = bbox_min_glob;
    x.max = bbox_max_glob;

    return {min:bbox_min_glob,max:bbox_max_glob,Contours:x };

}


sform2quaternion = function(mat)
{
 
   var vox = [ (math.norm([mat._data[0][0],mat._data[1][0],mat._data[2][0] ])),
               (math.norm([mat._data[0][1],mat._data[1][1],mat._data[2][1] ])),
               (math.norm([mat._data[0][2],mat._data[1][2],mat._data[2][2] ])),1];
   var ivox = [1/vox[0],1/vox[1],1/vox[2],1]
   var R = math.inv(math.multiply(mat,math.diag(ivox)));

   var sign = Math.sign(math.det(R));

   R = math.multiply(math.diag([1, 1, sign, 1]),R);

   var Rxx = R._data[0][0];
   var Rxy = R._data[0][1];
   var Rxz = R._data[0][2];
   var Ryx = R._data[1][0];
   var Ryy = R._data[1][1];
   var Ryz = R._data[1][2];
   var Rzx = R._data[2][0];
   var Rzy = R._data[2][1];
   var Rzz = R._data[2][2];
   var trace = Rxx+Ryy+Rzz;


   var w = 0;
   if (trace+1 > 0)
      w = Math.sqrt( trace + 1 ) / 2;

   var x = Math.sqrt( 1 + Rxx - Ryy - Rzz ) / 2;
   var y = Math.sqrt( 1 + Ryy - Rxx - Rzz ) / 2;
   var z = Math.sqrt( 1 + Rzz - Ryy - Rxx ) / 2;


   if (w >= x && w >= y && w >= z)
   {
        x = ( Rzy - Ryz ) / (4*w);
        y = ( Rxz - Rzx ) / (4*w);
        z = ( Ryx - Rxy ) / (4*w);
   }

   if (x >= w && x >= y && x >= z)
   {
        w = ( Rzy - Ryz ) / (4*x);
        y = ( Rxy + Ryx ) / (4*x);
        z = ( Rzx + Rxz ) / (4*x);
   }

   if (y >= w && y >= x && y >= z)
   {
        w = ( Rxz - Rzx ) / (4*y);
        x = ( Rxy + Ryx ) / (4*y);
        z = ( Ryz + Rzy ) / (4*y);
   }

   if (z >= w && z >= x && z >= x)
   {
        w = ( Ryx - Rxy ) / (4*z);
        x = ( Rzx + Rxz ) / (4*z);
        y = ( Ryz + Rzy ) / (4*z);
   }
   var eps = 0.0000000001;

   var quatern_b = -x * Math.sign(w-eps);
   var quatern_c = -y * Math.sign(w-eps);
   var quatern_d = -z * Math.sign(w-eps);   

   var qquat = { q: [quatern_b,quatern_c,quatern_d],
            pixdim: [sign,vox[0],vox[1],vox[2]] };

/*
var q = qquat.q
var a = Math.sqrt(Math.max(0.0,1.0-(q[0]*q[0]+q[1]*q[1]+q[2]*q[2])));
var b = q[0];
var c = q[1];
var d = q[2];
var pixdim = qquat.pixdim;
var qfac = pixdim[0];
   var a = Math.sqrt(Math.max(0.0,1.0-(b*b+c*c+d*d)))
  var e = [
      [pixdim[1]*(a*a+b*b-c*c-d*d),pixdim[1]*(2*b*c+2*a*d),pixdim[1]*(2*b*d-2*a*c)],
      [pixdim[2]*(2*b*c-2*a*d),pixdim[2]*(a*a+c*c-b*b-d*d),pixdim[2]*(2*c*d+2*a*b)],
      [qfac*pixdim[3]*(2*b*d+2*a*c),qfac*pixdim[3]*(2*c*d-2*a*b),qfac*pixdim[3]*(a*a+d*d-c*c-b*b)]]

console.log(print_matrix(e));
*/


   return qquat;
}


function merge_series()
{
	/* 
		merge series based on some tag expressions
		example: 
			ASL Hadamard: Must even merge only a subset of series
			Flatpanel CT
		
		Glue all series with same tags (or same up to an increment) together
			need a mapping for correct AcquisitionTime, ContentTime etc. 
			Where to define?

			SELECT SeriesGroups having SAME(SeriesDescription*, ProtocolName*) SELECT 2:end ORDER by SeriesTime, WHERE DIFF(SeriesTime) < 5sec

		Only select groups with n>1
			
		Check if can be glued (same spatiel orientation + image matrix) 


		a) need some regexp
			VPCT 5.0  1
			VPCT 5.0  2
			VPCT 5.0  3
		b) maybe should not glue all of them. 
			A range?  1:end-2 or 2:end for hadamard (need also a sortorder then)
			Some time logic?
		 		
		
		=> SeriesDescription="SAME"	
		 
	*/



}

