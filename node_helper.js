/* global Module */

/* node_helper.js
 *
 * Magic Mirror
 * Module: MMM-IMMICHALBUM
 *
 * Magic Mirror By Michael Teeuw http://michaelteeuw.nl
 * MIT Licensed.
 *
 * Module MMM-IMMICHALBUM By Stephen Corkins
 * MIT Licensed.
 */

// call in the required classes
const Log = require('../../js/logger.js');
var NodeHelper = require('node_helper');
const jo = require('jpeg-autorotate');
const axios = require('axios');
const convert = require('heic-convert');
const LOG_PREFIX = 'MMM-ImmichAlbum :: node_helper :: ';

// the main module helper create
module.exports = NodeHelper.create({
  
  // Min version of MM2 required
  requiresVersion: "2.1.0",

  // expressInstance: undefined,
  // subclass start method, clears the initial config array
  start: function () {
    this.validImageFileExtensions = new Set();
    // this.expressInstance = this.expressApp;
    this.imageList = [];
    this.index = 0;
    this.config;
    this.http = null;
    this.pictureDate = 0;
  },

  // shuffles an array at random and returns it
  shuffleArray: function (array) {
    for (let i = array.length - 1; i > 0; i--) {
      // j is a random index in [0, i].
      const j = Math.floor(Math.random() * (i + 1));
      [array[i], array[j]] = [array[j], array[i]];
    }
    return array;
  },

  // sort by filename attribute
  sortByFilename: function (a, b) {
    aL = a.originalFileName.toLowerCase();
    bL = b.originalFileName.toLowerCase();
    if (aL > bL) return 1;
    else return -1;
  },

  // sort by created attribute
  sortByCreated: function (a, b) {
    aL = a.fileCreatedAt;
    bL = b.fileCreatedAt;
    if (aL > bL) return 1;
    else return -1;
  },

  // sort by created attribute
  sortByModified: function (a, b) {
    aL = a.fileModifiedAt;
    bL = b.fileModifiedAt;
    if (aL > bL) return 1;
    else return -1;
  },

  sortImageList: function (imageList, sortBy, sortDescending) {
    Log.info(LOG_PREFIX + 'imageList is Array?', Array.isArray(imageList));
    let sortedList = imageList;
    switch (sortBy) {
      case 'created':
        // Log.log(LOG_PREFIX + 'Sorting by created date...');
        sortedList = imageList.sort(this.sortByCreated);
        break;
      case 'modified':
        // Log.log(LOG_PREFIX + 'Sorting by modified date...');
        sortedList = imageList.sort(this.sortByModified);
        break;
      case 'name':
        // sort by name
        // Log.log(LOG_PREFIX + 'Sorting by name...');
        sortedList = imageList.sort(this.sortByFilename);
        break;
      case 'random':
        // Log.log(LOG_PREFIX + 'Sorting by modified date...');
        sortedList = shuffleArray(imageList);
        break;
      default:
        // sort by name
        // Log.log(LOG_PREFIX + 'Sorting by name...');
        sortedList = imageList;
    }

    // If the user chose to sort in descending order then reverse the array
    if (sortDescending === true) {
      // Log.log(LOG_PREFIX + 'Reversing sort order...');
      sortedList = sortedList.reverse();
    }

    return sortedList;
  },

  // checks there's a valid image file extension
  checkValidImageFileExtension: function (filename) {
    if (!filename.includes('.')) {
      // No file extension.
      return false;
    }
    const fileExtension = filename.split('.').pop().toLowerCase();
    return this.validImageFileExtensions.has(fileExtension);
  },

  // gathers the image list
  gatherImageList: async function (config, sendNotification) {
    // Invalid config. retrieve it again
    if (config === undefined) {
      this.sendSocketNotification('IMMICHALBUM_REGISTER_CONFIG');
      return;
    }

    // create and axis instance
    this.http = axios.create({
      baseURL: config.immichUrl + '/api',
      timeout: 5000,
      headers: {
        'x-api-key': config.apiKey,
        'Accept': 'application/json'
      }
    })
   
    // create an empty main image list
    this.imageList = [];
    // Loop through the past 2 weeks and get the memory lanes
    // TODO: Do we keep looping until we reach a max # of photos?
    //       how do we determine max photos? is it fixed or determined based on config settings?
    
     // Get today's date at midnight
    let today = (new Date());
    today.setHours(0);
    today.setMinutes(0);
    today.setSeconds(0);
    today.setMilliseconds(0);
    this.pictureDate = new Date(today.getTime());
    Log.info(LOG_PREFIX + 'numDaysToInclude: ', config.numDaysToInclude);
    for (var i=0; i < config.numDaysToInclude; i++) {
      today.setDate(today.getDate()-1);
      Log.info(LOG_PREFIX + 'fetching images for: ', today.toISOString());
//**      response = await this.http.get('/asset/memory-lane', {params: {
//**        timestamp: today.toISOString()
        response = await this.http.get('/album/a20f95a4-2877-497e-8b31-c00e13b18bca',
          }, responseType: 'json'});
      // Log.info(LOG_PREFIX + 'response', today.toISOString(), response.data.length);
//**      response.data.forEach(memory => {
//**        this.imageList = memory.assets.concat(this.imageList);
        response.data.forEach(album => {
          this.imageList = album.assets.concat(this.imageList);
        // Log.info(LOG_PREFIX + 'imageList', today.toISOString(), this.imageList.length);
      });
    }

    // Now loop through and remove any movies
    if (this.imageList.length > 0) {
      this.imageList = this.imageList.filter(element => {
        // Log.info('Filtering element', element);
        return this.checkValidImageFileExtension(element.originalPath);
      });
    }

    // Now sort them according to config
    this.imageList = this.sortImageList(this.imageList, config.sortImagesBy, config.sortImagesDescending);

    // Log.info(LOG_PREFIX + this.imageList.length + ' files found');
    if (this.index < 0 || this.index >= this.imageList.length) {
      //Set this index back to zero only if necessary
      this.index = 0;
    }

    // let other modules know about album images
    this.sendSocketNotification('IMMICHALBUM_FILELIST', {
      imageList: this.imageList
    });

    // build the return payload
    const returnPayload = {
      identifier: config.identifier
    };

    // signal ready
    if (sendNotification) {
      this.sendSocketNotification('IMMICHALBUM_READY', returnPayload);
    }
  },

  getNextImage: function () {
    Log.info(LOG_PREFIX + 'Current Image: ', this.index, ' of ', this.imageList.length, '. Getting next image...');
    if (!this.imageList.length || this.index >= this.imageList.length || Date.now() - this.pictureDate > 86400000) {
      // if there are no images or all the images have been displayed or it is the next day, try loading the images again
      this.gatherImageList(this.config);
    }
    //
    if (!this.imageList.length) {
      // still no images, search again after 5 mins
      setTimeout(() => {
        this.getNextImage(config);
      }, 300000);
      return;
    }

    var image = this.imageList[this.index++];
    Log.info(LOG_PREFIX + 'reading image "' + image.originalPath + '"');
    self = this;
    
    const returnPayload = {
      identifier: self.config.identifier,
      path: image.originalPath,
      exifInfo: image.exifInfo,
      data: null,
      imageId: image.id,
      index: self.index,
      total: self.imageList.length
    };

    this.http.get(`/asset/file/${image.id}`, {
      responseType: 'arraybuffer'
    }).then(async(response) => {
      try {
        const imageBuffer = Buffer.from(response.data, 'binary');
        if (image.originalPath.toLowerCase().endsWith('heic')) {
          Log.info(LOG_PREFIX + ' converting HEIC to JPG..');
          // convert the main image to jpeg
          returnPayload.data = (await convert({
            buffer: imageBuffer, // the HEIC file buffer
            format: 'JPEG',      // output format
            quality: 1           // the jpeg compression quality, between 0 and 1
          })).toString('base64');
        } else {
          returnPayload.data = imageBuffer.toString('base64');
        }

        self.sendSocketNotification(
          'IMMICHALBUM_DISPLAY_IMAGE',
          returnPayload
        );
      } catch (e) {
        Log.error(LOG_PREFIX + 'Oops!  Exception while loading and converting image', e);
      }
    });
    
  },

  getPrevImage: function () {
    // imageIndex is incremented after displaying an image so -2 is needed to
    // get to previous image index.
    this.index -= 2;

    // Case of first image, go to end of array.
    if (this.index < 0) {
      this.index = 0;
    }
    this.getNextImage();
  },

  // resizeImage: function (input, callback) {
  //   Jimp.read(input)
  //     .then((image) => {
  //       image
  //         .scaleToFit(
  //           parseInt(this.config.maxWidth),
  //           parseInt(this.config.maxHeight)
  //         )
  //         .getBuffer(Jimp.MIME_JPEG, (err, buffer) => {
  //           callback('data:image/jpg;base64, ' + buffer.toString('base64'));
  //         });
  //     })
  //     .catch((err) => {
  //       Log.log(err);
  //     });
  // },

  resume: function() {
    Log.info(LOG_PREFIX + 'Resuming...', this.config.slideshowSpeed);
    this.suspend();
    this.getNextImage();
    if (!this.timer) {
      this.timer = setInterval(() => {
        this.getNextImage();
      }, this.config.slideshowSpeed);
    }
  },

  suspend: function() {
    Log.info(LOG_PREFIX + 'Suspending...');
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  },

  // subclass socketNotificationReceived, received notification from module
  socketNotificationReceived: function (notification, payload) {
    if (notification === 'IMMICHALBUM_REGISTER_CONFIG') {
      const config = payload;

      // Create set of valid image extensions.
      const validExtensionsList = config.validImageFileExtensions
        .toLowerCase()
        .split(',');
      this.validImageFileExtensions = new Set(validExtensionsList);

      // Get the image list in a non-blocking way since large # of images would cause
      // the MagicMirror startup banner to get stuck sometimes.
      this.config = config;
      setTimeout(() => {
        this.gatherImageList(config, true);
      }, 200);
    } else if (notification === 'IMMICHALBUM_PLAY_VIDEO') {
      Log.info(LOG_PREFIX + 'mw got IMMICHALBUM_PLAY_VIDEO');
      Log.info(
        LOG_PREFIX + 'cmd line:' + 'omxplayer --win 0,0,1920,1080 --alpha 180 ' + payload[0]
      );
      exec(
        'omxplayer --win 0,0,1920,1080 --alpha 180 ' + payload[0],
        (e, stdout, stderr) => {
          this.sendSocketNotification('IMMICHALBUM_PLAY', null);
          Log.info(LOG_PREFIX + 'mw video done');
        }
      );
    } else if (notification === 'IMMICHALBUM_NEXT_IMAGE') {
      Log.info(LOG_PREFIX + 'IMMICHALBUM_NEXT_IMAGE');
      // this.getNextImage();
    } else if (notification === 'IMMICHALBUM_PREV_IMAGE') {
      Log.info(LOG_PREFIX + 'IMMICHALBUM_PREV_IMAGE');
      this.getPrevImage();
    } else if (notification === 'IMMICHALBUM_RESUME') {
      // Resume
      this.resume();
    } else if (notification === 'IMMICHALBUM_SUSPEND') {
      // Suspend
      this.suspend();
    } else {
      Log.info(LOG_PREFIX + 'Received Unexpected Notification', notification);
    }
  }
});

//------------ end -------------
