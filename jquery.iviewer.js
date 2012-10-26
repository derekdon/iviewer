/*
 * iviewer Widget for jQuery UI
 * https://github.com/can3p/iviewer
 *
 * Copyright (c) 2009 - 2012 Dmitry Petrov
 * Dual licensed under the MIT and GPL licenses.
 *  - http://www.opensource.org/licenses/mit-license.php
 *  - http://www.gnu.org/copyleft/gpl.html
 *
 * Author: Dmitry Petrov
 * Version: 0.7.5
 */

( function( $, undefined ) {

//this code was taken from the https://github.com/furf/jquery-ui-touch-punch
var mouseEvents = {
        touchstart: 'mousedown',
        touchmove: 'mousemove',
        touchend: 'mouseup'
    },
    gesturesSupport = 'ongesturestart' in document.createElement('div');


/**
 * Convert a touch event to a mouse-like
 */
function makeMouseEvent (event) {
    var touch = event.originalEvent.changedTouches[0];

    return $.extend(event, {
        type:    mouseEvents[event.type],
        which:   1,
        pageX:   touch.pageX,
        pageY:   touch.pageY,
        screenX: touch.screenX,
        screenY: touch.screenY,
        clientX: touch.clientX,
        clientY: touch.clientY,
        isTouchEvent: true
    });
}

var mouseProto = $.ui.mouse.prototype,
    _mouseInit = $.ui.mouse.prototype._mouseInit;

mouseProto._mouseInit = function() {
    var self = this;
    self._touchActive = false;

    this.element.bind( 'touchstart.' + this.widgetName, function(event) {
        if (gesturesSupport && event.originalEvent.touches.length > 1) { return; }
        self._touchActive = true;
        return self._mouseDown(makeMouseEvent(event));
    })

    var self = this;
    // these delegates are required to keep context
    this._mouseMoveDelegate = function(event) {
        if (gesturesSupport && event.originalEvent.touches && event.originalEvent.touches.length > 1) { return; }
        if (self._touchActive) {
            return self._mouseMove(makeMouseEvent(event));
        }
    };
    this._mouseUpDelegate = function(event) {
        if (self._touchActive) {
            self._touchActive = false;
            return self._mouseUp(makeMouseEvent(event));
        }
    };

    $(document)
        .bind('touchmove.'+ this.widgetName, this._mouseMoveDelegate)
        .bind('touchend.' + this.widgetName, this._mouseUpDelegate);

    _mouseInit.apply(this);
}

/**
 * Simple implementation of jQuery like getters/setters
 * var val = something();
 * something(val);
 */
var setter = function(setter, getter) {
    return function(val) {
        if (arguments.length === 0) {
            return getter.apply(this);
        } else {
            setter.apply(this, arguments);
        }
    }
};

/**
 * Internet explorer rotates image relative left top corner, so we should
 * shift image when it's rotated.
 */
var ieTransforms = {
        '0': {
            marginLeft: 0,
            marginTop: 0,
            filter: 'progid:DXImageTransform.Microsoft.Matrix(M11=1, M12=0, M21=0, M22=1, SizingMethod="auto expand")'
        },

        '90': {
            marginLeft: -1,
            marginTop: 1,
            filter: 'progid:DXImageTransform.Microsoft.Matrix(M11=0, M12=-1, M21=1, M22=0, SizingMethod="auto expand")'
        },

        '180': {
            marginLeft: 0,
            marginTop: 0,
            filter: 'progid:DXImageTransform.Microsoft.Matrix(M11=-1, M12=0, M21=0, M22=-1, SizingMethod="auto expand")'
        },

        '270': {
            marginLeft: -1,
            marginTop: 1,
            filter: 'progid:DXImageTransform.Microsoft.Matrix(M11=0, M12=1, M21=-1, M22=0, SizingMethod="auto expand")'
        }
    },
    useIeTransforms = (jQuery.browser.msie && parseInt(jQuery.browser.version, 10) <= 8);

$.widget( "ui.iviewer", $.ui.mouse, {
    widgetEventPrefix: "iviewer",
    options : {
        /**
        * start zoom value for element, not used now
        * may be equal to "fit" to fit element into container or scale in %
        **/
        zoom: "fit",
        /**
        * base value to scale element
        **/
        zoom_base: 100,
        /**
        * maximum zoom
        **/
        zoom_max: 800,
        /**
        * minimum zoom
        **/
        zoom_min: 25,
        /**
        * base of rate multiplier.
        * zoom is calculated by formula: zoom_base * zoom_delta^rate
        **/
        zoom_delta: 1.4,
        /**
        * whether the zoom should be animated.
        */
        zoom_animation: true,
        /**
        * if true plugin doesn't add its own controls
        **/
        ui_disabled: false,
        /**
         * If false mousewheel will be disabled
         */
        mousewheel: true,
        /**
        * if false, plugin doesn't bind resize event on window and this must
        * be handled manually
        **/
        update_on_resize: true,
        /**
        * event is triggered when zoom value is changed
        * @param int new zoom value
        * @return boolean if false zoom action is aborted
        **/
        onZoom: jQuery.noop,
        /**
        * event is triggered when zoom value is changed after element is set to the new dimensions
        * @param int new zoom value
        * @return boolean if false zoom action is aborted
        **/
        onAfterZoom: jQuery.noop,
        /**
        * event is triggered when move has completed
        * @param object coords move coordinates
        * @return object coords move coordinates
        **/
        onAfterMove: jQuery.noop,
        /**
        * event is fired on drag begin
        * @param object coords mouse coordinates on the element
        * @return boolean if false is returned, drag action is aborted
        **/
        onStartDrag: jQuery.noop,
        /**
        * event is fired on drag action
        * @param object coords mouse coordinates on the element
        **/
        onDrag: jQuery.noop,
        /**
        * event is fired on drag stop
        * @param object coords mouse coordinates on the element
        **/
        onStopDrag: jQuery.noop,
        /**
        * event is fired when mouse moves over element
        * @param object coords mouse coordinates on the element
        **/
        onMouseMove: jQuery.noop,
        /**
        * mouse click event
        * @param object coords mouse coordinates on the element
        **/
        onClick: jQuery.noop,
        /**
        * event is fired when an image element starts to load
        */
        onStartLoad: null,
        /**
        * event is fired, when an image element is loaded and initially positioned
        */
        onFinishLoad: null,
        /**
        * event is fired when an image element load error occurs
        */
        onErrorLoad: null,
        /**
        * Work this out from the tag type?
        */
		isCanvas: false
	},

    _create: function() {
        var me = this;

        //drag variables
        this.dx = 0;
        this.dy = 0;

        /* object containing actual information about image
        *   @img_object.object - jquery img object
        *   @img_object.orig_{width|height} - original dimensions
        *   @img_object.display_{width|height} - actual dimensions
        */
        this.img_object = new $.ui.iviewer.ImageObject(this.options.zoom_animation);
		
		/* object containing actual information about canvas
        *   @canvas_object.object - jquery canvas object
        *   @canvas_object.orig_{width|height} - original dimensions
        *   @canvas_object.display_{width|height} - actual dimensions
        */
        this.canvas_object = new $.ui.iviewer.CanvasObject(this.options.zoom_animation);

        this.zoom_object = {}; //object to show zoom status

        this._angle = 0;

        this.current_zoom = this.options.zoom;

        if(this.options.src === null){
            return;
        }

        this.container = this.element;

        this._updateContainerInfo();

        //init container
        this.container.css("overflow","hidden");

        if(this.options.update_on_resize == true)
        {
            $(window).resize(function()
            {
                me._updateContainerInfo();
            });
        }
		
        this.element_object = this.options.isCanvas ? this.canvas_object : this.img_object;
		
        if (this.options.mousewheel) {
            this.element_object.object()
                .mousewheel(function(ev, delta)
                {
                    //this event is there instead of containing div, because
                    //at opera it triggers many times on div
                    var zoom = (delta > 0)?1:-1,
                        container_offset = me.container.offset(),
                        mouse_pos = {
                            x: ev.pageX - container_offset.left,
                            y: ev.pageY - container_offset.top
                        };

                    me.zoom_by(zoom, mouse_pos);
                    return false;
                });

            if (gesturesSupport) {
                var gestureThrottle = +new Date();
                var originalScale, originalCenter;
                this.element_object.object()
                    // .bind('gesturestart', function(ev) {
                    .bind('touchstart', function(ev) {
                        originalScale = me.current_zoom;
                        var touches = ev.originalEvent.touches,
                            container_offset;
                        if (touches.length == 2) {
                            container_offset = me.container.offset();
                            originalCenter = {
                                x: (touches[0].pageX + touches[1].pageX) / 2  - container_offset.left,
                                y: (touches[0].pageY + touches[1].pageY) / 2 - container_offset.top
                            };
                        } else {
                            originalCenter = null;
                        }
                    }).bind('gesturechange', function(ev) {
                        //do not want to import throttle function from underscore
                        var d = +new Date();
                        if ((d - gestureThrottle) < 50) { return; }
                        gestureThrottle = d;
                        var zoom = originalScale * ev.originalEvent.scale;
                        me.set_zoom(zoom, originalCenter);
                        ev.preventDefault();
                    }).bind('gestureend', function(ev) {
                        originalCenter = null;
                    });
            }
        }

        //init object
        this.element_object.object()
            //bind mouse events
            .click(function(e){return me._click(e)})
                .prependTo(this.container);

        this.container.bind('mousemove', function(ev) { me._handleMouseMove(ev); });

		if(this.element_object._img)
		{
			this.loadImage(this.options.src);
		}
		else
		{
			this._imageLoaded(); // Using canvas, trigger imageLoaded logic
		}
		
        if(!this.options.ui_disabled)
        {
            this.createui();
        }

        this._mouseInit();
    },

    destroy: function() {
        $.Widget.prototype.destroy.call( this );
        this._mouseDestroy();
        this.element_object.object().remove();
    },

    _updateContainerInfo: function()
    {
        this.options.height = this.container.height();
        this.options.width = this.container.width();
    },

    loadImage: function( src )
    {
        this.current_zoom = this.options.zoom;
        var me = this;

        this._trigger('onStartLoad', 0, src);

        this.container.addClass("iviewer_loading");
        this.img_object.load(src, function() {
            me._imageLoaded(src);
        }, function() {
            me._trigger("onErrorLoad", 0, src);
        });
    },

    _imageLoaded: function(src) {
        this.container.removeClass("iviewer_loading");
        this.container.addClass("iviewer_cursor");

        if(this.options.zoom == "fit"){
            this.fit(true);
        }
        else {
            this.set_zoom(this.options.zoom, true);
        }

		if(src)
			this._trigger('onFinishLoad', 0, src);
    },

    /**
    * fits element in the container
    *
    * @param {boolean} skip_animation
    **/
    fit: function(skip_animation)
    {
        var aspect_ratio = this.element_object.orig_width() / this.element_object.orig_height();
        var window_ratio = this.options.width /  this.options.height;
        var choose_left = (aspect_ratio > window_ratio);
        var new_zoom = 0;

        if(choose_left){
            new_zoom = this.options.width / this.element_object.orig_width() * 100;
        }
        else {
            new_zoom = this.options.height / this.element_object.orig_height() * 100;
        }

      this.set_zoom(new_zoom, skip_animation);
    },

    /**
    * center element in container
    **/
    center: function()
    {
        this.setCoords(-Math.round((this.element_object.display_width() - this.options.width)/2),
                -Math.round((this.element_object.display_height() - this.options.height)/2));
    },

    /**
    *   move a point in container to the center of display area
    *   @param x a point in container
    *   @param y a point in container
    **/
    moveTo: function(x, y, skip_animation, resetFirst)
    {
		var elObj = this.element_object;
		
		// Reset 
		if(resetFirst)
		{
			elObj._reset(elObj.orig_width(), elObj.orig_height());
			this.current_zoom = this.options.zoom;
		}
		
        var dx = x-Math.round(this.options.width/2);
        var dy = y-Math.round(this.options.height/2);

        var new_x = elObj.x() - dx;
        var new_y = elObj.y() - dy;
		
		var dis_width = elObj.display_width();
		var dis_height = elObj.display_height();
		
		var self = this;

		if(skip_animation)
		{
			this.setCoords(new_x, new_y);
			self._trigger('onAfterMove', 0, {x:new_x, y:new_y} );
		}
		else
		{
			// Testing...
			
			// elObj.setProps(dis_width, dis_height, new_x, new_y,
											// false, function() {
				// self._trigger('onAfterMove', 0, {x:new_x, y:new_y} );
			// });
			
			this.set_zoom(400, {x:x, y:y}); // Using raw values
		}
    },

    /**
     * Get container offset object.
     */
    getContainerOffset: function() {
        return jQuery.extend({}, this.container.offset());
    },

    /**
    * set coordinates of upper left corner of element object
    **/
    setCoords: function(x,y)
    {
        //do nothing while image elements are being loaded
        if(this.element_object._img && !this.element_object.loaded()) { return; }

        var coords = this._correctCoords(x,y);
        this.element_object.x(coords.x);
        this.element_object.y(coords.y);
    },

    _correctCoords: function( x, y )
    {
        x = parseInt(x, 10);
        y = parseInt(y, 10);

        //check new coordinates to be correct (to be in rect)
        if(y > 0){
            y = 0;
        }
        if(x > 0){
            x = 0;
        }
        if(y + this.element_object.display_height() < this.options.height){
            y = this.options.height - this.element_object.display_height();
        }
        if(x + this.element_object.display_width() < this.options.width){
            x = this.options.width - this.element_object.display_width();
        }
        if(this.element_object.display_width() <= this.options.width){
            x = -(this.element_object.display_width() - this.options.width)/2;
        }
        if(this.element_object.display_height() <= this.options.height){
            y = -(this.element_object.display_height() - this.options.height)/2;
        }

        return { x: x, y:y };
    },


    /**
    * convert coordinates on the container to the coordinates on the element (in original size)
    *
    * @return object with fields x,y according to coordinates or false
    * if initial coords are not inside the element
    **/
    containerToElement : function (x,y)
    {
        var coords = { x : x - this.element_object.x(),
                 y :  y - this.element_object.y()
        };

        coords = this.element_object.toOriginalCoords(coords);

        return { x :  util.descaleValue(coords.x, this.current_zoom),
                 y :  util.descaleValue(coords.y, this.current_zoom)
        };
    },

    /**
    * convert coordinates on the element (in original size, and zero angle) to the coordinates on the container
    *
    * @return object with fields x,y according to coordinates
    **/
    elementToContainer : function (x,y)
    {
        var coords = {
                x : util.scaleValue(x, this.current_zoom),
                y : util.scaleValue(y, this.current_zoom)
            };

        return this.element_object.toRealCoords(coords);
    },

    /**
    * get mouse coordinates on the element
    * @param e - object containing pageX and pageY fields, e.g. mouse event object
    *
    * @return object with fields x,y according to coordinates or false
    * if initial coords are not inside the element
    **/
    _getMouseCoords : function(e)
    {
        var containerOffset = this.container.offset();
            coords = this.containerToElement(e.pageX - containerOffset.left, e.pageY - containerOffset.top);

        return coords;
    },

    /**
    * set element scale to the new_zoom
    *
    * @param {number} new_zoom element scale in %
    * @param {boolean} skip_animation
    * @param {x: number, y: number} Coordinates of point the should not be moved on zoom. The default is the center of element.
    **/
    set_zoom: function(new_zoom, skip_animation, zoom_center)
    {
        if (this._trigger('onZoom', 0, new_zoom) == false) {
            return;
        }

		//do nothing while image elements are being loaded
        if(this.element_object._img && !this.element_object.loaded()) { return; }

        zoom_center = zoom_center || {
            x: Math.round(this.options.width/2),
            y: Math.round(this.options.height/2)
        }

        if(new_zoom <  this.options.zoom_min)
        {
            new_zoom = this.options.zoom_min;
        }
        else if(new_zoom > this.options.zoom_max)
        {
            new_zoom = this.options.zoom_max;
        }

        /* we fake these values to make fit zoom properly work */
        if(this.current_zoom == "fit")
        {
            var old_x = zoom_center.x + Math.round(this.element_object.orig_width()/2);
            var old_y = zoom_center.y + Math.round(this.element_object.orig_height()/2);
            this.current_zoom = 100;
        }
        else {
            var old_x = -this.element_object.x() + zoom_center.x;
            var old_y = -this.element_object.y() + zoom_center.y
        }

        var new_width = util.scaleValue(this.element_object.orig_width(), new_zoom);
        var new_height = util.scaleValue(this.element_object.orig_height(), new_zoom);
        var new_x = util.scaleValue( util.descaleValue(old_x, this.current_zoom), new_zoom);
        var new_y = util.scaleValue( util.descaleValue(old_y, this.current_zoom), new_zoom);

        new_x = zoom_center.x - new_x;
        new_y = zoom_center.y - new_y;

        new_width = Math.floor(new_width);
        new_height = Math.floor(new_height);
        new_x = Math.floor(new_x);
        new_y = Math.floor(new_y);

        this.element_object.display_width(new_width);
        this.element_object.display_height(new_height);

        var coords = this._correctCoords( new_x, new_y ),
            self = this;

        this.element_object.setProps(new_width, new_height, coords.x, coords.y,
                                        skip_animation, function() {
            self._trigger('onAfterZoom', 0, new_zoom );
        });
        this.current_zoom = new_zoom;

        this.update_status();
    },

    /**
    * changes zoom scale by delta
    * zoom is calculated by formula: zoom_base * zoom_delta^rate
    * @param Integer delta number to add to the current multiplier rate number
    * @param {x: number, y: number=} Coordinates of point the should not be moved on zoom.
    **/
    zoom_by: function(delta, zoom_center)
    {
        var closest_rate = this.find_closest_zoom_rate(this.current_zoom);

        var next_rate = closest_rate + delta;
        var next_zoom = this.options.zoom_base * Math.pow(this.options.zoom_delta, next_rate)
        if(delta > 0 && next_zoom < this.current_zoom)
        {
            next_zoom *= this.options.zoom_delta;
        }

        if(delta < 0 && next_zoom > this.current_zoom)
        {
            next_zoom /= this.options.zoom_delta;
        }

        this.set_zoom(next_zoom, undefined, zoom_center);
    },

    /**
    * Rotate images
    * @param {num} deg Degrees amount to rotate. Positive values rotate image clockwise.
    *     Currently 0, 90, 180, 270 and -90, -180, -270 values are supported
    *
    * @param {boolean} abs If the flag is true if, the deg parameter will be considered as
    *     a absolute value and relative otherwise.
    * @return {num|null} Method will return current image angle if called without any arguments.
    **/
    angle: function(deg, abs) {
        if (arguments.length === 0) { return this.img_object.angle(); }

        if (deg < -270 || deg > 270 || deg % 90 !== 0) { return null; }
        if (!abs) { deg += this.img_object.angle(); }
        if (deg < 0) { deg += 360; }
        if (deg >= 360) { deg -= 360; }

        if (deg === this.img_object.angle()) { return null; }

        this.img_object.angle(deg);
        //the rotate behavior is different in all editors. For now we  just center the
        //image. However, it will be better to try to keep the position.
        this.center();
        this._trigger('angle', 0, { angle: this.img_object.angle() });
    },

    /**
    * finds closest multiplier rate for value
    * basing on zoom_base and zoom_delta values from settings
    * @param Number value zoom value to examine
    **/
    find_closest_zoom_rate: function(value)
    {
        if(value == this.options.zoom_base)
        {
            return 0;
        }

        function div(val1,val2) { return val1 / val2 };
        function mul(val1,val2) { return val1 * val2 };

        var func = (value > this.options.zoom_base)?mul:div;
        var sgn = (value > this.options.zoom_base)?1:-1;

        var mltplr = this.options.zoom_delta;
        var rate = 1;

        while(Math.abs(func(this.options.zoom_base, Math.pow(mltplr,rate)) - value) >
              Math.abs(func(this.options.zoom_base, Math.pow(mltplr,rate+1)) - value))
        {
            rate++;
        }

        return sgn * rate;
    },

    /* update scale info in the container */
    update_status: function()
    {
        if(!this.options.ui_disabled)
        {
            var percent = Math.round(100*this.element_object.display_height()/this.element_object.orig_height());
            if(percent && this.zoom_object.html)
            {
                this.zoom_object.html(percent + "%");
            }
        }
    },

    /**
     * Get some information about the element.
     *     Currently orig_(width|height), display_(width|height), angle, zoom and src params are supported.
     *
     *  @param {string} parameter to check
     *  @param {boolean} withoutRotation if param is orig_width or orig_height and this flag is set to true,
     *      method will return original element width without considering rotation.
     *
     */
    info: function(param, withoutRotation) {
        if (!param) { return; }
		
		if(!this.element_object._img)
			withoutRotation = false;

        switch (param) {
            case 'orig_width':
            case 'orig_height':
                if (withoutRotation) {
                    return (this.element_object.angle() % 180 === 0 ? this.element_object[param]() :
                            param === 'orig_width' ? this.element_object.orig_height() : 
                                                        this.element_object.orig_width());
                } else {
                    return this.element_object[param]();
                }
            case 'display_width':
            case 'display_height':
            case 'angle':
                return this.element_object[param]();
            case 'zoom':
                return this.current_zoom;
            case 'src':
                return this.element_object.object().attr('src');
            case 'coords':
                return {
                    x: this.element_object.x(),
                    y: this.element_object.y()
                };
        }
    },

    /**
    *   callback for handling mousdown event to start dragging the element
    **/
    _mouseStart: function( e )
    {
        $.ui.mouse.prototype._mouseStart.call(this, e);
        if (this._trigger('onStartDrag', 0, this._getMouseCoords(e)) === false) {
            return false;
        }

        /* start drag event*/
        this.container.addClass("iviewer_drag_cursor");

        //#10: fix movement quirks for ipad
        this._dragInitialized = !(e.originalEvent.changedTouches && e.originalEvent.changedTouches.length==1);

        this.dx = e.pageX - this.element_object.x();
        this.dy = e.pageY - this.element_object.y();
        return true;
    },

    _mouseCapture: function( e ) {
        return true;
    },

    /**
     * Handle mouse move if needed. User can avoid using this callback, because
     *    he can get the same information through public methods.
     *  @param {jQuery.Event} e
     */
    _handleMouseMove: function(e) {
        this._trigger('onMouseMove', e, this._getMouseCoords(e));
    },

    /**
    *   callback for handling mousemove event to drag the element
    **/
    _mouseDrag: function(e)
    {
        $.ui.mouse.prototype._mouseDrag.call(this, e);

        //#10: imitate mouseStart, because we can get here without it on iPad for some reason
        if (!this._dragInitialized) {
            this.dx = e.pageX - this.element_object.x();
            this.dy = e.pageY - this.element_object.y();
            this._dragInitialized = true;
        }

        var ltop =  e.pageY - this.dy;
        var lleft = e.pageX - this.dx;

        this.setCoords(lleft, ltop);
        this._trigger('onDrag', e, this._getMouseCoords(e));
        return false;
    },

    /**
    *   callback for handling stop drag
    **/
    _mouseStop: function(e)
    {
        $.ui.mouse.prototype._mouseStop.call(this, e);
        this.container.removeClass("iviewer_drag_cursor");
        this._trigger('onStopDrag', 0, this._getMouseCoords(e));
    },

    _click: function(e)
    {
        this._trigger('onClick', 0, this._getMouseCoords(e));
    },

    /**
    *   create zoom buttons info box
    **/
    createui: function()
    {
        var me=this;

        $("<div>", { 'class': "iviewer_zoom_in iviewer_common iviewer_button"})
                    .bind('mousedown touchstart',function(){me.zoom_by(1); return false;})
                    .appendTo(this.container);

        $("<div>", { 'class': "iviewer_zoom_out iviewer_common iviewer_button"})
                    .bind('mousedown touchstart',function(){me.zoom_by(- 1); return false;})
                    .appendTo(this.container);

        $("<div>", { 'class': "iviewer_zoom_zero iviewer_common iviewer_button"})
                    .bind('mousedown touchstart',function(){me.set_zoom(100); return false;})
                    .appendTo(this.container);

        $("<div>", { 'class': "iviewer_zoom_fit iviewer_common iviewer_button"})
                    .bind('mousedown touchstart',function(){me.fit(this); return false;})
                    .appendTo(this.container);

		this.zoom_object = $("<div>").addClass("iviewer_zoom_status iviewer_common").appendTo(this.container);
		
		if(this.element_object._img)
		{
			$("<div>", { 'class': "iviewer_rotate_left iviewer_common iviewer_button"})
						.bind('mousedown touchstart',function(){me.angle(-90); return false;})
						.appendTo(this.container);

			$("<div>", { 'class': "iviewer_rotate_right iviewer_common iviewer_button" })
						.bind('mousedown touchstart',function(){me.angle(90); return false;})
						.appendTo(this.container);
		}

        this.update_status(); //initial status update
    }

} );

/**
 * @class $.ui.iviewer.CompatibleObject Class represents a compatible html object and provides public api.
 * @constructor
 */
$.ui.iviewer.CompatibleObject = function() {
    this._requiredCss = { position: "absolute", top :"0px", left: "0px"};
    this._swapDimensions = false;
    this._do_anim = false;
    this.x(0, true);
    this.y(0, true);
    this._angle = 0;
};

/**
 * @class $.ui.iviewer.ImageObject Class represents image and provides public api without
 *     extending image prototype.
 * @constructor
 * @param {boolean} do_anim Do we want to animate image on dimension changes?
 */
$.ui.iviewer.ImageObject = function(do_anim) {
    this._img = $("<img>");

    //this is needed, because chromium sets them auto otherwise
    this._setCss(this._requiredCss);

    this._do_anim = do_anim || false;
    this._loaded = false;
};

/**
 * @class $.ui.iviewer.CanvasObject Class represents canvas and provides public api without
 *     extending canvas prototype.
 * @constructor
 * @param {boolean} do_anim Do we want to animate canvas on dimension changes?
 */
$.ui.iviewer.CanvasObject = function(do_anim) {
    this._canvas = $("<canvas>");

    //this is needed, because chromium sets them auto otherwise
    this._setCss(this._requiredCss);

    this._do_anim = do_anim || false;

    // Just give the canvas object some values during testing...
	this._reset(600, 300);
};

/** @lends $.ui.iviewer.CompatibleObject.prototype */
(function() {

    /**
     * Get the sub class object. Override this.
     *
     * @return {object}
     */
    this._getObject = function() {
        return null;
    };

    /**
     * Restore initial object state.
     *
     * @param {number} w Object width.
     * @param {number} h Object height.
     */
    this._reset = function(w, h) {
        this._swapDimensions = false;
        this.x(0);
        this.y(0);

        this.orig_width(w);
        this.orig_height(h);
        this.display_width(w);
        this.display_height(h);
    };

    this._dimension = function(prefix, name) {
        var horiz = '_' + prefix + '_' + name,
            vert = '_' + prefix + '_' + (name === 'height' ? 'width' : 'height');
        return setter(function(val) {
                this[this._swapDimensions ? horiz: vert] = val;
            },
            function() {
                return this[this._swapDimensions ? horiz: vert];
            });
    };

    /**
     * Getters and setter for common object dimensions.
     *    display_ means real object dimensions
     *    orig_ means physical object dimensions.
     *  Note, that dimensions are swapped if object is rotated. It necessary,
     *  because as little as possible code should know about rotation.
     */
    this.display_width = this._dimension('display', 'width'),
    this.display_height = this._dimension('display', 'height'),
    this.display_diff = function() { return Math.floor( this.display_width() - this.display_height() ) };
    this.orig_width = this._dimension('orig', 'width'),
    this.orig_height = this._dimension('orig', 'height'),

    /**
     * Set the object css.
     *
     * @param {object} cssObject Object containing css style properties.
     */
    this._setCss = function(cssObject) {
        var obj = this._getObject ? this._getObject() : null;
        if(obj)
            obj.css(cssObject);
    };

    /**
     * Setter for  X coordinate. If object is rotated we need to also shift the
     *     object to map object coordinate to the visual position.
     *
     * @param {number} val Coordinate value.
     * @param {boolean} skipCss If true, we only set the value and do not touch the dom.
     */
    this.x = setter(function(val, skipCss) {
            this._x = val;
            if (!skipCss) {
                this._setCss({left: this._x + (this._swapDimensions ? this.display_diff() / 2 : 0) + "px"});
            }
        },
        function() {
            return this._x;
        });

    /**
     * Setter for  Y coordinate. If object is rotated we need to also shift the
     *     object to map object coordinate to the visual position.
     *
     * @param {number} val Coordinate value.
     * @param {boolean} skipCss If true, we only set the value and do not touch the dom.
     */
    this.y = setter(function(val, skipCss) {
            this._y = val;
            if (!skipCss) {
                this._setCss({top: this._y - (this._swapDimensions ? this.display_diff() / 2 : 0) + "px"});
            }
        },
       function() {
            return this._y;
       });

    /**
     * Map point in the container coordinates to the point in object coordinates.
     *
     * @param {{x: number, y: number}} point Point in container coordinates.
     * @return  {{x: number, y: number}}
     */
    this.toOriginalCoords = function(point) {
        return { x: point.x, y: point.y }
    };

    /**
     * Map point in the object coordinates to the point in container coordinates.
     *
     * @param {{x: number, y: number}} point Point in container coordinates.
     * @return  {{x: number, y: number}}
     */
    this.toRealCoords = function(point) {
        return { x: this.x() + point.x, y: this.y() + point.y }
    };

    /**
     * @return {jQuery} Return object node. this is needed to add event handlers.
     */
    this.object = setter(jQuery.noop, function() { return this._getObject(); });

    /**
     * Change properties.
     *
     * @param {number} disp_w Display width;
     * @param {number} disp_h Display height;
     * @param {number} x
     * @param {number} y
     * @param {boolean} skip_animation If true, the animation will be skipped despite the
     *     value set in constructor.
     * @param {Function=} complete Call back will be fired when zoom will be complete.
     */
    this.setProps = function(disp_w, disp_h, x, y, skip_animation, complete) {
        complete = complete || jQuery.noop;

        this.display_width(disp_w);
        this.display_height(disp_h);
        this.x(x, true);
        this.y(y, true);

        var w = this._swapDimensions ? disp_h : disp_w;
        var h = this._swapDimensions ? disp_w : disp_h;

        var params = {
            width: w,
            height: h,
            top: y - (this._swapDimensions ? this.display_diff() / 2 : 0) + "px",
            left: x + (this._swapDimensions ? this.display_diff() / 2 : 0) + "px"
        };

        if (useIeTransforms) {
            jQuery.extend(params, {
                marginLeft: ieTransforms[this._angle].marginLeft * this.display_diff() / 2,
                marginTop: ieTransforms[this._angle].marginTop * this.display_diff() / 2
            });
        }

        var swapDims = this._swapDimensions, obj = this._getObject(), setCss = this._setCss;

        //here we come: another IE oddness. If the object is rotated 90 degrees with a filter, than
        //width and height getters return real width and height of rotated object. The bad news
        //is that to set height you need to set a width and vice versa. Fuck IE.
        //So, in this case we have to animate width and height manually.
        if(useIeTransforms && swapDims) {
            var ieh = obj.width(),
                iew = obj.height(),
                iedh = params.height - ieh;
                iedw = params.width - iew;

            delete params.width;
            delete params.height;
        }

        if (this._do_anim && !skip_animation) {
            obj.stop(true)
                .animate(params, {
                    duration: 200,
                    complete: complete,
                    step: function(now, fx) {
                        if(useIeTransforms && swapDims && (fx.prop === 'top')) {
                            var percent = (now - fx.start) / (fx.end - fx.start);
                            obj.height(ieh + iedh * percent);
                            obj.width(iew + iedw * percent);
                            setCss({top: now})
                        }
                    }
                });
        } else {
            setCss(params);
            setTimeout(complete, 0); //both if branches should behave equally.
        }
    };

}).apply($.ui.iviewer.CompatibleObject.prototype);

/** @lends $.ui.iviewer.ImageObject.prototype */
(function() {

    /**
     * Get the image object.
     *
     * @return {object}
     */
    this._getObject = function() {
        return this._img;
    };

    /**
     * Check if image is loaded.
     *
     * @return {boolean}
     */
    this.loaded = function() { return this._loaded; };

    /**
     * Load image.
     *
     * @param {string} src Image url.
     * @param {Function=} loaded Function will be called on image load.
     */
    this.load = function(src, loaded, error) {
        var self = this;

        loaded = loaded || jQuery.noop;
        this._loaded = false;

        //If we assign new image url to the this._img IE9 fires onload event and image width and
        //height are set to zero. So, we create another image object and load image through it.
        var img = new Image();
        img.onload = function() {
            self._loaded = true;
            self._reset(this.width, this.height);

            self._img
                .removeAttr("src")
                .removeAttr("width")
                .removeAttr("height")
                .removeAttr("style")
                //max-width is reset, because plugin breaks in the twitter bootstrap otherwise
                .css({ position: "absolute", top :"0px", left: "0px", maxWidth: "none"})

            self._img[0].src = src;
            loaded();
        };

        img.onerror = error;

        img.src = src;
        this.angle(0);
    };

    /**
     * Perform image rotation.
     *
     * @param {number} deg Absolute image angle. The method will work with values 0, 90, 180, 270 degrees.
     */
    this.angle = setter(function(deg) {
            var prevSwap = this._swapDimensions;

            this._angle = deg;
            this._swapDimensions = deg % 180 !== 0;
            
            if (prevSwap !== this._swapDimensions) {
                var verticalMod = this._swapDimensions ? -1 : 1;
                this.x(this.x() - verticalMod * this.display_diff() / 2, true);
                this.y(this.y() + verticalMod * this.display_diff() / 2, true);
            };

            var cssVal = 'rotate(' + deg + 'deg)',
                img = this._img;

            jQuery.each(['', '-webkit-', '-moz-', '-o-', '-ms-'], function(i, prefix) {
                img.css(prefix + 'transform', cssVal);
            });

            if (useIeTransforms) {
                jQuery.each(['-ms-', ''], function(i, prefix) {
                    img.css(prefix + 'filter', ieTransforms[deg].filter);
                });

                img.css({
                    marginLeft: ieTransforms[deg].marginLeft * this.display_diff() / 2,
                    marginTop: ieTransforms[deg].marginTop * this.display_diff() / 2
                });
            }
        },
       function() { return this._angle; });

}).apply($.ui.iviewer.ImageObject.prototype = new $.ui.iviewer.CompatibleObject);


/** @lends $.ui.iviewer.CanvasObject.prototype */
(function() {

    /**
     * Get the canvas object.
     *
     * @return {object}
     */
    this._getObject = function() {
        return this._canvas;
    };

}).apply($.ui.iviewer.CanvasObject.prototype = new $.ui.iviewer.CompatibleObject);

var util = {
    scaleValue: function(value, toZoom)
    {
        return value * toZoom / 100;
    },

    descaleValue: function(value, fromZoom)
    {
        return value * 100 / fromZoom;
    }
};

 } )( jQuery, undefined );